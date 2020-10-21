import { Cluster } from "@aws-cdk/aws-eks";
import { Effect, PolicyStatement } from "@aws-cdk/aws-iam";
import { Construct, Stack, StackProps } from "@aws-cdk/core";
import { App } from 'cdk8s';
import { CloudWatchAgent } from "./k8s-aws-container-insights-cloudwatch-agent-chart";
import { FluentD } from "./k8s-aws-container-insights-fluentd-chart";
import { ContainerInsightsFoundation } from "./k8s-aws-container-insights-foundation-chart";

interface K8sAwsContainerInsightsSetupProperties extends StackProps{
    environment: string,
    context: string,
    eksCluster: Cluster
}

export class K8sAwsContainerInsightsSetup extends Stack{

    constructor(scope: Construct,id: string, props: K8sAwsContainerInsightsSetupProperties){

        super(scope,id,props);

        const namespaceName = "amazon-cloudwatch";

        const cdk8sApp = new App();

        const containerInsightsFoundationChart = new ContainerInsightsFoundation(cdk8sApp,'ContainerInsightsFoundation',props);

        const containerInsightsFoundationAssignment = props.eksCluster.addCdk8sChart('ContainerInsightsFoundation',containerInsightsFoundationChart);

        const fluentdServiceAccount = props.eksCluster.addServiceAccount('FluentdServiceAccount',{
            name: "fluentd",
            namespace: `${namespaceName}`
        });
        fluentdServiceAccount.addToPolicy(this.createCwAgentStatement());
        fluentdServiceAccount.addToPolicy(this.createCwAgentSsmStatement());

        const cloudWatchAgentServiceAccount = props.eksCluster.addServiceAccount('CloudWatchAgentServiceAccount',{
            name: "cloudwatch-agent",
            namespace: `${namespaceName}`
        });
        //cloudWatchAgentServiceAccount.node.addDependency(containerInsightsFoundationChart);
        //we use the ServiceAccount to AWS IAM Roles relation to provide proper permission
        cloudWatchAgentServiceAccount.addToPolicy(this.createCwAgentStatement());
        cloudWatchAgentServiceAccount.addToPolicy(this.createCwAgentSsmStatement());

        const cloudWatchAgentChart = new CloudWatchAgent(cdk8sApp,'CloudWatchAgent',{
            env: props.env,
            environment: props.environment,
            context: props.context,
            eksCluster: props.eksCluster,
            namespace: containerInsightsFoundationChart.namespaceName,
            serviceAccount: cloudWatchAgentServiceAccount
        });
        cloudWatchAgentChart.addDependency(containerInsightsFoundationChart);
    
        const cloudWatchAgentAssignment = props.eksCluster.addCdk8sChart('CloudWatchAgentAssignment',cloudWatchAgentChart);

        const fluentdChart = new FluentD(cdk8sApp,'FluentD',{
            env: props.env,
            environment: props.environment,
            context: props.context,
            eksCluster: props.eksCluster,
            namespace: containerInsightsFoundationChart.namespaceName,
            serviceAccount: fluentdServiceAccount
        });
        //otherwise we see "namespace missing" issues from our AWS Lambda, again
        fluentdChart.addDependency(containerInsightsFoundationChart);

        const fluentdAssignment = props.eksCluster.addCdk8sChart('FluentDAssignment',fluentdChart);

        //having the ServiceAccount creation directly within the Chart leads to error:
        // cannot find a parent chart (directly or indirectly) + Cannot read property 'findAll' of undefined
        fluentdServiceAccount.node.addDependency(containerInsightsFoundationAssignment);
        cloudWatchAgentServiceAccount.node.addDependency(containerInsightsFoundationAssignment);
        cloudWatchAgentAssignment.node.addDependency(cloudWatchAgentServiceAccount);
        fluentdAssignment.node.addDependency(fluentdServiceAccount);
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