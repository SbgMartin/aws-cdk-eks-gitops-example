import { Cluster } from "@aws-cdk/aws-eks";
import { Construct, Stack, StackProps } from "@aws-cdk/core";
import * as cdk8s from 'cdk8s';
import { K8sBackendApplicationDefinitionChart } from './k8s-ingress-setup-chart';

interface K8sBackendApplicationSetupProperties extends StackProps{
    environment: string,
    context: string,
    eksCluster: Cluster
}

export class K8sBackendApplicationSetup extends Stack{

    constructor(scope: Construct, id: string, props: K8sBackendApplicationSetupProperties){
        
        super(scope, id, props);

        //let's use CDK8S here (from now on: everywhere :-)) as it is supported since 1.67
        const cdk8sApp = new cdk8s.App();
        const cdk8sIngressSetupChart = new K8sBackendApplicationDefinitionChart(cdk8sApp,'BackendApplicationChart');

        props.eksCluster.addCdk8sChart('BackendApplicationChartAssignment',cdk8sIngressSetupChart);
    }
}