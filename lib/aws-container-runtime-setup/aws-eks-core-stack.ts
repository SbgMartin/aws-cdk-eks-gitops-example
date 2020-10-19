import { StackProps, Stack, Construct } from '@aws-cdk/core';
import { AccountPrincipal, AccountRootPrincipal, ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Cluster, KubernetesVersion, Nodegroup } from '@aws-cdk/aws-eks';
import { InstanceType, Vpc } from '@aws-cdk/aws-ec2';
import { Key } from '@aws-cdk/aws-kms';

interface EksCoreStackProperties extends StackProps {
    environment: string,
    context: string,
    vpc: Vpc
}

export class EksCoreStack extends Stack {

    public readonly eksCluster: Cluster;
    public readonly workerNodeGroup: Nodegroup;

    constructor(scope: Construct,id: string, props: EksCoreStackProperties){

      //never forget to pass the parameters, you will receive the following error then:
      //The given Stage construct ('blablupp') should contain at least one Stack
      super(scope, id, props);

      // the AWS IAM Role which creates the cluster is the super-admin - so define a dedicated one which is used for setup/maintainance
      const clusterAdmin = new Role(this, `${props.environment}-${props.context}-cluster-super-admin-role`, {
        assumedBy: new AccountRootPrincipal()
      });

      clusterAdmin.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'));
      clusterAdmin.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'));

      // AWS IAM Role which is assigned via EC2 InstanceProfile to AWS EC2 instances (aka WorkerNodes)
      const workerNodeRole = new Role(this, `${props.environment}-${props.context}-worker-node-role`, {
        assumedBy: new ServicePrincipal('ec2.amazonaws.com')
      });

      //Control Plane's etcd is encrypted with standard AWS owned KMS Key - hereby we replace it with our own, to increase security
      const etcdSecretsEncryptionKey = new Key(this, `${props.environment}-${props.context}-etcd-secrets-key`);

      //AWS EKS Cluster
      this.eksCluster = new Cluster(this, 'Cluster', {
        vpc: props.vpc,
        defaultCapacity: 0, //@Todo: evaluate this parameter in more detail
        mastersRole: clusterAdmin,
        outputClusterName: true,
        version: KubernetesVersion.V1_16, //give some chance to test upgrade ;-)
        clusterName: `${props.environment}-${props.context}-container-runtime`,
        secretsEncryptionKey: etcdSecretsEncryptionKey
      });

      this.workerNodeGroup = this.eksCluster.addNodegroupCapacity(`${props.environment}-${props.context}-managed-nodegroup`,{
          minSize: 1,
          maxSize: 3,
          instanceType: new InstanceType('t3.small'),
          labels: {
              'workload-type': 'constant'
          }
      });

      //role for kubectl interaction done by team members - basically you could distinguish here on your organizational needs
      //by adding as many roles you need
      const teamMemberRole = new Role(this,'teamMember',{
        assumedBy: new AccountPrincipal(props.env?.account)
      });
      teamMemberRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

      //doing this outside of this stack leads to potential circular dependencies
      //teamMemberRole shall have an own RBAC role for providing only the minimum amount of permissions
      this.eksCluster.awsAuth.addRoleMapping(teamMemberRole, { groups: ["system:masters"], username: teamMemberRole.roleArn });
    }
}