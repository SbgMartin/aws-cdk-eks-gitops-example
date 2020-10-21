import { StackProps, Stack, Construct, Aspects, Tag } from '@aws-cdk/core';
import { Cluster, Nodegroup, ServiceAccount } from '@aws-cdk/aws-eks';
import { IVpc } from '@aws-cdk/aws-ec2';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import * as yaml from "js-yaml";
import * as fs from "fs";

interface K8sAlbIngressControllerProperties extends StackProps {
    environment: string,
    context: string,
    eksCluster: Cluster,
    vpc: IVpc,
    workerNodeGroup: Nodegroup
}

export class K8sAlbIngressController extends Stack {

    public readonly namespaceName: string;

    constructor(scope: Construct,id: string, props: K8sAlbIngressControllerProperties) {
        
        super(scope,id,props);

        this.namespaceName = "alb-ingress";

        //first we need to enhance permissions for AWS related assets for the ALB Ingress AWS parts which is the ALB itself + additional resources like WAF
        //this leads to the fact that this stack is created BEFORE the EKS Core Stack is created
        //props.workerNodeGroup.role.addManagedPolicy(this.createIamPolicy());

        //Subnet tagging is essential for the ALB Controller to know which ones need to be assigned to the ALB instance
        props.vpc.publicSubnets.forEach((subnet) => {
          Aspects.of(subnet).add(new Tag('kubernetes.io/role/elb', '1', { includeResourceTypes: ['AWS::EC2::Subnet'] }));
        });

        props.vpc.privateSubnets.forEach((subnet) => {
          Aspects.of(subnet).add(new Tag('kubernetes.io/role/internal-elb', '1', { includeResourceTypes: ['AWS::EC2::Subnet'] }));
        });

        //Namespace
        const namespace = props.eksCluster.addManifest('AlbIngressNamespaceManifest',{
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: `${this.namespaceName}`,
            labels:{
              name: `${this.namespaceName}`
            }
          }
        });

        //ServiceAccount
        const albIngressServiceAccount = props.eksCluster.addServiceAccount('AlbIngressServiceAccount',{
          name: "alb-ingress-controller",
          namespace: `${this.namespaceName}`
        });

        this.addAlbPermissionsToServiceAccount(albIngressServiceAccount); 
        albIngressServiceAccount.node.addDependency(namespace);

        const albIngressControllerRbacManifest = yaml.safeLoadAll(fs.readFileSync('./lib/k8s-addon-alb-ingress-controller/file-assets/rbac-role.yaml').toString());
  
        //we have multiple manifests obtained from file, thus we need spread parameter
        props.eksCluster.addManifest('AlbIngressControllerRbacManifest',...albIngressControllerRbacManifest);

        //Example 1: inline-declaration style
        //until CDK8S is compatible to CDK constructs, we use the plain JSON handling here
        const albManifest = props.eksCluster.addManifest('AlbIngressControllerDeploymentManifest', {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            labels: {
              ["app.kubernetes.io/name"]: "alb-ingress-controller"
            },
            name: "alb-ingress-controller",
            namespace: "alb-ingress"
          },
          spec: {
            selector: {
              matchLabels: { ["app.kubernetes.io/name"]: "alb-ingress-controller" }
            },
            template: {
              metadata: {
                labels: { ["app.kubernetes.io/name"]: "alb-ingress-controller" }
              },
              spec: {
                serviceAccountName: "alb-ingress-controller",
                containers: [
                  {
                    name: "alb-ingress-controller",
                    image: "docker.io/amazon/aws-alb-ingress-controller:v1.1.9",
                    args: [
                      "--ingress-class=alb",
                      `--cluster-name=${props.eksCluster.clusterName}`,
                      `--aws-vpc-id=${props.vpc.vpcId}`
                    ]
                  }
                ]
              }
            } 
          }
        });

        albManifest.node.addDependency(namespace);
    }

    protected addAlbPermissionsToServiceAccount(albServiceAccount: ServiceAccount){
      //source: https://github.com/kubernetes-sigs/aws-alb-ingress-controller/blob/master/docs/examples/iam-policy.json 
      //@Todo: add Route53

      const acmStatement = new PolicyStatement( {
        actions: [
          "acm:DescribeCertificate",
          "acm:ListCertificates",
          "acm:GetCertificate"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(acmStatement);

      const ec2Statement = new PolicyStatement( {
        actions: [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:CreateSecurityGroup",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:DeleteSecurityGroup",
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeTags",
          "ec2:DescribeVpcs",
          "ec2:ModifyInstanceAttribute",
          "ec2:ModifyNetworkInterfaceAttribute",
          "ec2:RevokeSecurityGroupIngress"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(ec2Statement);

      const elasticLoadBalancingStatement = new PolicyStatement( {
        actions: [
          "elasticloadbalancing:AddListenerCertificates",
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:DeregisterTargets",
          "elasticloadbalancing:DescribeListenerCertificates",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeSSLPolicies",
          "elasticloadbalancing:DescribeTags",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:RemoveListenerCertificates",
          "elasticloadbalancing:RemoveTags",
          "elasticloadbalancing:SetIpAddressType",
          "elasticloadbalancing:SetSecurityGroups",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:SetWebACL"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(elasticLoadBalancingStatement);

      const iamStatement = new PolicyStatement( {
        actions: [
          "iam:CreateServiceLinkedRole",
          "iam:GetServerCertificate",
          "iam:ListServerCertificates"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(iamStatement);

      const cognitoStatement = new PolicyStatement( {
        actions: [
          "cognito-idp:DescribeUserPoolClient"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(cognitoStatement);

      const wafV2Statement = new PolicyStatement( {
        actions: [
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      });

      albServiceAccount.addToPrincipalPolicy(wafV2Statement);

      const wafRegionalStatement = new PolicyStatement( {
        actions: [
          "waf-regional:GetWebACLForResource",
          "waf-regional:GetWebACL",
          "waf-regional:AssociateWebACL",
          "waf-regional:DisassociateWebACL"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      });

      albServiceAccount.addToPrincipalPolicy(wafRegionalStatement);

      const wafStatement = new PolicyStatement( {
        actions: [
          "waf:GetWebACL"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(wafStatement);

      const tagStatement = new PolicyStatement( {
        actions: [
          "tag:GetResources",
          "tag:TagResources"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(tagStatement);

      const shieldStatement = new PolicyStatement( {
        actions: [
          "shield:DescribeProtection",
          "shield:GetSubscriptionState",
          "shield:DeleteProtection",
          "shield:CreateProtection",
          "shield:DescribeSubscription",
          "shield:ListProtections"
        ],
        resources: ["*"],
        effect: Effect.ALLOW
      }
      );

      albServiceAccount.addToPrincipalPolicy(shieldStatement);
    }
}