import { Construct, Stage, StageProps } from '@aws-cdk/core';
import { EksCoreStack } from '../aws-container-runtime-setup/aws-eks-core-stack';
import { BaseNetworkStack } from '../aws-core-infrastructure/base-network-stack'
import { K8sAlbIngressController } from '../k8s-addon-alb-ingress-controller/k8s-alb-ingress-controller';
import { K8sAwsContainerInsightsSetup as ContainerInsightsSetupWithCdk8s } from '../k8s-addon-aws-container-insights/k8s-aws-container-insights-setup-with-cdk8s'; 
import { K8sBackendApplicationSetup } from '../k8s-ingress-definition-cdk8s/k8s-ingress-setup-with-cdk8s';

interface CdkEksGitOpsSetupStageProperties extends StageProps {
    environment: string,
    context: string
  }

export class CdkEksGitOpsSetupStage extends Stage {

    constructor(scope: Construct, id: string, props: CdkEksGitOpsSetupStageProperties){

        super(scope, id, props);

        //create the foundational network assets
        const baseNetwork = new BaseNetworkStack(this, 'BaseNetworkStack', {
            env: props.env,
            context : props.context,
            environment : props.environment
        });

        //create AWS EKS Cluster
        const containerRuntimeStack = new EksCoreStack(this, 'EksCoreStack', {
            env: props.env,
            context : props.context,
            environment : props.environment,
            vpc: baseNetwork.vpc
        });

        //deploy K8s AddOn ALB Ingress Controller
        const albIngressControllerStack = new K8sAlbIngressController(this, 'alb-ingress-controller',{
            env: props.env,
            environment: props.environment,
            context: props.context,
            eksCluster: containerRuntimeStack.eksCluster,
            vpc: baseNetwork.vpc,
            workerNodeGroup: containerRuntimeStack.workerNodeGroup
        } );

        //deploy AWS Container Insights
        const awsContainerInsightsStack = new ContainerInsightsSetupWithCdk8s(this, 'aws-container-insights',{
            env: props.env,
            environment: props.environment,
            context: props.context,
            eksCluster: containerRuntimeStack.eksCluster
        });

        //deploy backend application in order to verify our stack is properly configured
        const backendApplication = new K8sBackendApplicationSetup(this, 'backend-application-setup',{
            env: props.env,
            environment: props.environment,
            context: props.context,
            eksCluster: containerRuntimeStack.eksCluster
        });
        
    }
}