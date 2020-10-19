import { Cluster, KubernetesPatch } from "@aws-cdk/aws-eks";
import { Construct, Stack, StackProps } from "@aws-cdk/core";
import * as yaml from "js-yaml";
import * as fs from "fs";
import { Effect, PolicyStatement } from "@aws-cdk/aws-iam";

interface K8sAwsContainerInsightsSetupProperties extends StackProps {
    environment: string,
    context: string,
    eksCluster: Cluster
}

/*
* This is the 2nd variant to create resources on our AWS EKS cluster: grab the file from repo, apply it and patch it afterwards (if needed)
*/
export class K8sAwsContainerInsightsSetup extends Stack{

    constructor(scope: Construct, id: string, props: K8sAwsContainerInsightsSetupProperties){

        super(scope,id,props);

        //first we retrieve all K8s manifests from file-assets folder
        //we use fs.readFileSync as Nodejs event loop is being blocked, which means you can immediately react on exceptions
        //the path is relative from project root, where 'npx cdk synth' or 'yarn run cdk synth' command is being executed

        const cloudWatchAgentServiceAccountRoleManifest = yaml.safeLoadAll(fs.readFileSync('./lib/k8s-addon-aws-container-insights/file-assets/cwagent-serviceaccount.yaml').toString()).filter((rbac: any) => { return rbac });
  
        const containerInsightsNamespaceManifest = yaml.safeLoad(fs.readFileSync('./lib/k8s-addon-aws-container-insights/file-assets/cloudwatch-namespace.yaml').toString());

        const cloudWatchAgentConfigMapManifest = yaml.safeLoad(fs.readFileSync('./lib/k8s-addon-aws-container-insights/file-assets/cwagent-configmap.yaml').toString());

        const cloudWatchAgentDaemonSetManifest = yaml.safeLoad(fs.readFileSync('./lib/k8s-addon-aws-container-insights/file-assets/cwagent-daemonset.yaml').toString());

        //create namespace which holds all AWS Container Insights relevant components
        const cloudWatchAgentCompositeManifest = props.eksCluster.addManifest('aws-container-insights-ns', 
                                        containerInsightsNamespaceManifest,
                                        ...cloudWatchAgentServiceAccountRoleManifest,                                            
                                        cloudWatchAgentDaemonSetManifest);
        
        const cwAgentConfigMap = props.eksCluster.addManifest('aws-container-insights-cm', cloudWatchAgentConfigMapManifest);
        cwAgentConfigMap.node.addDependency(cloudWatchAgentCompositeManifest);

        //obviously creating Service accounts is best to be done via method instead of KubernetesManifest
        const containerInsightsServiceAccount = props.eksCluster.addServiceAccount('aws-container-insights-sa',{
            name: 'cloudwatch-agent', 
            namespace: 'amazon-cloudwatch' });
        
        //we use the ServiceAccount to AWS IAM Roles relation to provide proper permission
        containerInsightsServiceAccount.addToPolicy(this.createCwAgentStatement());
        containerInsightsServiceAccount.addToPolicy(this.createCwAgentSsmStatement());

        containerInsightsServiceAccount.node.addDependency(cloudWatchAgentCompositeManifest);

        //The issue here is the configuration content within the K8s manifests - in older times your pipeline might have used ENVSUBST to substitute
        //placeholders within the file and apply the newly generated one - in this example we are using KubernetesPatch to fix that :-) :-(
       
        //our files are YAML and KubernetesPatch requires json :-(
        const cloudwatchAgentResourcesPatch = new KubernetesPatch(this, 'aws-container-insights-setup-patch', {
            cluster: props.eksCluster,
            resourceName: 'configmap/cwagentconfig',
            resourceNamespace: 'amazon-cloudwatch',
            applyPatch: {
              "data": {
                "cwagentconfig.json": `{\n  \"logs\": {\n    \"metrics_collected\": {\n      \"kubernetes\": {\n        \"cluster_name\": \"{{${props.eksCluster.clusterName}}}\",\n        \"metrics_collection_interval\": 60\n      }\n    },\n    \"force_flush_interval\": 5\n  }\n}\n`
            }
            },
            restorePatch: {
              "data": {
                "cwagentconfig.json": `{\n  \"logs\": {\n    \"metrics_collected\": {\n      \"kubernetes\": {\n        \"cluster_name\": \"{{${props.eksCluster.clusterName}}}\",\n        \"metrics_collection_interval\": 60\n      }\n    },\n    \"force_flush_interval\": 5\n  }\n}\n`
            }
            }
        });

        cloudwatchAgentResourcesPatch.node.addDependency(cloudWatchAgentCompositeManifest);

        //now comes the FluentD part
        const fluentdServiceAccount = props.eksCluster.addServiceAccount('aws-container-insights-fluentd',{
            name: "fluentd", 
            namespace: "amazon-cloudwatch" });

        fluentdServiceAccount.addToPolicy(this.createCwAgentStatement());
       
        fluentdServiceAccount.node.addDependency(cloudWatchAgentCompositeManifest);

        //fetch RBAC assets from manifest asset
        const selectionCriteria = ["ConfigMap","ServiceAccount"];

        //as we demo the use of existing assets we need to do some filter - when starting from ground up with a greenfield approach (CDK8S) it's not needed
        const fluentDmanifest = yaml.safeLoadAll(fs.readFileSync('./lib/k8s-addon-aws-container-insights/file-assets/cwagent-fluentd-quickstart.yaml').toString()).filter( k8sResource => !selectionCriteria.includes(k8sResource.kind));

        //to avoid patching with KubernetesPatch afterwards we define it here
        const fluentDbaseConfigMap = props.eksCluster.addManifest('aws-container-insights-fluentd-cm', {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
              name: "cluster-info",
              namespace: "amazon-cloudwatch"
          },
          data: {
            ["cluster.name"]: props.eksCluster.clusterName,
            ["logs.region"]: props.env?.region
          }
        });

        fluentDbaseConfigMap.node.addDependency(cloudWatchAgentCompositeManifest);

        //again, this is a demo repo for workshops - thus we extract now exactly that part from manifest relevant
        const fluentDappConfig = yaml.safeLoadAll(fs.readFileSync('./lib/k8s-addon-aws-container-insights/file-assets/cwagent-fluentd-quickstart.yaml').toString()).filter( k8sResource => k8sResource['metadata']['name'] === 'fluentd-config');

        const fluentdCompositeManifest = props.eksCluster.addManifest('aws-container-insights-fluentd-setup',
            ...fluentDmanifest,
            ...fluentDappConfig);
        
        fluentdCompositeManifest.node.addDependency(cloudWatchAgentCompositeManifest);
        cloudwatchAgentResourcesPatch.node.addDependency(cloudWatchAgentCompositeManifest);
    }

    protected createCwAgentStatement(): PolicyStatement {

        const cloudWatchPermissions = new PolicyStatement( {
          actions: [
            "cloudwatch:PutMetricData",
            "ec2:DescribeVolumes",
            "ec2:DescribeTags",
            "logs:PutLogEvents",
            "logs:DescribeLogStreams",
            "logs:DescribeLogGroups",
            "logs:CreateLogStream",
            "logs:CreateLogGroup"
          ],
          resources: ["*"],
          effect: Effect.ALLOW
        });

        return cloudWatchPermissions;
    }

    protected createCwAgentSsmStatement(): PolicyStatement {

        const cloudWatchPermissions = new PolicyStatement( {
            actions: [
              "ssm:GetParameter"
            ],
            resources: ["arn:aws:ssm:*:*:parameter/AmazonCloudWatch-*"],
            effect: Effect.ALLOW
          });
  
          return cloudWatchPermissions;
    }
}