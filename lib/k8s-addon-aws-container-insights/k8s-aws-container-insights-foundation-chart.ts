import { Construct } from 'constructs';
import { Chart } from 'cdk8s';
import { Namespace } from '../../imports/k8s';
import { StackProps } from '@aws-cdk/core';
import { Cluster } from '@aws-cdk/aws-eks';

export interface ContainerInsightsFoundationProperties extends StackProps{
    environment: string,
    context: string,
    eksCluster: Cluster
}

export class ContainerInsightsFoundation extends Chart {

    public readonly namespaceName = "amazon-cloudwatch";

  constructor(scope: Construct, name: string, props: ContainerInsightsFoundationProperties) {
  
    super(scope, name);

    //right now the common denominator is the namespace
    const namespace = new Namespace(this, 'CloudWatchAgentNamespace',{
        metadata: {
            name: `${this.namespaceName}`,
            labels: {
              workloadcategory : "essential" 
           }
        }
    });
  }
}
