import { Construct } from 'constructs';
import { Chart } from 'cdk8s';
import { ClusterRole, ClusterRoleBinding, ConfigMap, DaemonSet, ServiceAccount } from '../../imports/k8s';
import { StackProps } from '@aws-cdk/core';
import { Cluster, ServiceAccount as EksServiceAccount } from '@aws-cdk/aws-eks';
import { ConfigMap as ConfigMapPlus } from 'cdk8s-plus';
import { CloudWatchAgent } from './k8s-aws-container-insights-cloudwatch-agent-chart';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';

export interface FluentDProperties extends StackProps{
    environment: string,
    context: string,
    eksCluster: Cluster,
    namespace: string,
    serviceAccount: EksServiceAccount
}

export class FluentD extends Chart {

  constructor(scope: Construct, name: string, props: FluentDProperties) {
  
    super(scope, name);

    const fluentdRbacClusterRole = new ClusterRole(this,'FluentdClusterRole', {
        metadata: {
          name: "fluentd-role"
        },
        rules: [
            {
                apiGroups: [""],
                resources: [ "namespaces", "pods", "pods/logs" ],
                verbs: ["get", "list", "watch"]
            }]
        }
    );

    const fluentdRbacClusterRoleBinding = new ClusterRoleBinding(this,'FluentdClusterRoleBinding',{
        metadata:{
            name: "fluentd-role-binding"
        },
        subjects:[
            {
                kind: "ServiceAccount",
                name: `${props.serviceAccount.serviceAccountName}`,
                namespace: `${props.namespace}`
        }],
        roleRef: {
            kind: `${fluentdRbacClusterRole.kind}`,
            name: `${fluentdRbacClusterRole.metadata.name}`,
            apiGroup: `rbac.authorization.k8s.io`
        }
    });

    const clusterInfoConfigMap = this.createClusterInfoConfigMap(props);

    //the CDK8S ConfigMap is missing an "addFile()" method and for such a large ConfigMap like this one here CDK8S+ is a better choice
    const fluentDConfigMap = new ConfigMapPlus(this, 'fluentdConfiguration', {
        metadata: {
          name: 'fluentd-config',
          namespace: `${props.namespace}`
        },
      });
    fluentDConfigMap.addDirectory(`${__dirname}/file-assets/`);

    const daemonSet = this.createFluentDDaemonSet(props);
  }

  protected createClusterInfoConfigMap(props: FluentDProperties): ConfigMap {
      return new ConfigMap(this,'ClusterInfoConfigMap',{
        metadata: {
            name: "cluster-info",
            namespace: `${props.namespace}`
        },
        "data": {
            "cluster.name": `${props.eksCluster.clusterName}`,
            "logs.region": `${props.env?.region}`
      }
    });
  }

  protected createFluentDDaemonSet(props: FluentDProperties): DaemonSet {
      return new DaemonSet(this,'FluentDDaemonSet',{
          metadata: {
              name: "fluentd-cloudwatch",
              namespace: `${props.namespace}`
          },
          spec: {
            selector: {
              matchLabels: {
                name: "fluentd-cloudwatch"
              },
            },
          template: {
            metadata: {
              labels: {
                name: "fluentd-cloudwatch"
              },
            },
            spec: {
                initContainers: [
                    {
                        name: "copy-fluentd-config",
                        image: "busybox",
                        command: ['sh', '-c', 'cp /config-volume/..data/* /fluentd/etc'],
                        volumeMounts: [
                            {
                                name: "config-volume",
                                mountPath: "/config-volume",
                            },
                            {
                                name: "fluentdconf",
                                mountPath: "/fluentd/etc"
                            }],
                    },
                    {
                        name: "update-log-driver",
                        image: "busybox",
                        command: ['sh','-c','']
                    }],
                containers: [
                    {
                    name: "fluentd-cloudwatch",
                    image: "fluent/fluentd-kubernetes-daemonset:v1.7.3-debian-cloudwatch-1.0",
                    resources: {
                        limits: {
                        cpu: "200m",
                        memory: "400Mi"
                        },
                        requests: {
                        cpu: "100m",
                        memory: "200Mi"
                        }
                    },
                    env: [
                        {
                            name: "REGION",
                            valueFrom: {
                                configMapKeyRef: {
                                    name: "cluster-info",
                                    key: "logs.region"
                                }
                            }
                        },
                        {
                            name: "CLUSTER_NAME",
                            valueFrom: {
                                configMapKeyRef: {
                                    name: "cluster-info",
                                    key: "cluster.name"
                                }
                            }
                        },
                        {
                            name: "CI_VERSION",
                            value: "k8s/1.2.2"
                        }
                        ],
                        volumeMounts: [
                            {
                                name: "config-volume",
                                mountPath: "/config-volume"
                            },
                            {
                                name: "fluentdconf",
                                mountPath: "/fluentd/etc"
                            },
                            {
                                name: "varlog",
                                mountPath: "/var/log"
                            },
                            {
                                name: "varlibdockercontainers",
                                mountPath: "/var/lib/docker/containers",
                                readOnly: true
                            },
                            {
                                name: "runlogjournal",
                                mountPath: "/run/log/journal",
                                readOnly: true
                            },
                            {
                                name: "dmesg",
                                mountPath: "/var/log/dmesg",
                                readOnly: true
                            }
                        ]
                    }
                ],
                volumes: [
                    {
                        name: "config-volume",
                        configMap: {
                            name: "fluentd-config"
                        }
                    },
                    {
                        name: "fluentdconf",
                        emptyDir: {}
                    },
                    {
                        name: "varlog",
                        hostPath: {
                            path: "/var/log"
                        }
                    },
                    {
                        name: "varlibdockercontainers",
                        hostPath: {
                            path: "/var/lib/docker/containers"
                        }
                    },
                    {
                        name: "runlogjournal",
                        hostPath: {
                            path: "/run/log/journal"
                        }
                    },
                    {
                        name: "dmesg",
                        hostPath: {
                            path: "/var/log/dmesg"
                        }
                    }
                ],
                terminationGracePeriodSeconds: 30,
                serviceAccountName: `${props.serviceAccount.serviceAccountName}`
            }
        }
      }
    });
  }

  protected createFluentDStatement(): PolicyStatement {

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

protected createFluentDSsmStatement(): PolicyStatement {

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