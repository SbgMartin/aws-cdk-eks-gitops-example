import { StackProps, Stack, Construct, CfnOutput } from '@aws-cdk/core';
import { Vpc, SubnetType } from '@aws-cdk/aws-ec2';

interface BaseNetworkStackProperties extends StackProps {
    environment: string,
    context: string
}

export class BaseNetworkStack extends Stack {

    public readonly cfnOutputVpcId: CfnOutput;
    public readonly vpc: Vpc;

    //@Todo: is this still needed? 
    get availabilityZones(): string[] {
        return ['eu-central-1a', 'eu-central-1b','eu-central-1c'];
      }

    constructor(scope: Construct, id: string, props: BaseNetworkStackProperties){
        super(scope, id, props);

        this.vpc = new Vpc(this, `${props.environment}-${props.context}-BaseNetwork-VPC`, {
          cidr: '10.0.0.0/16',
          //having only 1 NAT Gateway is saving costs for PoC purpose, enterprise-readiness achieved by using one per AZ
          natGateways: 1,
          //eu-central-1 has three AZs, for cost reasons we reduce to two AZ (some AWS resources introduced later need two AZs, so we do not use just one AZ)
          maxAzs: 3,
          subnetConfiguration: [
            {
              cidrMask: 20,
              name: 'PublicSubnet',
              subnetType: SubnetType.PUBLIC,
            },
            {
              cidrMask: 20,
              name: 'PrivateSubnet',
              subnetType: SubnetType.PRIVATE,
            }
          ]
        });
        
        //the export name has to be unique throughout the whole AWS Account; for deterministics we use our common identifiers as prefix
        //Outputs are potentially also used by other stacks outside of this AWS CDK Application, consider this when designing them - this
        //one here is just an example: if the VPC should be used for other things like AWS RDS then it makes sense, if only K8s workload should
        //run here, then do not use CfnOutput!
        this.cfnOutputVpcId = new CfnOutput(this, "VPC-ID",{
            value: this.vpc.vpcId,
            exportName: `${props.environment}-${props.context}-EKS-VPC-ID`
        });
    }
}