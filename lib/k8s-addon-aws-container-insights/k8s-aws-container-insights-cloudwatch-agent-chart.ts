import { Construct } from 'constructs';
import { Chart } from 'cdk8s';
import { ClusterRole, ClusterRoleBinding, ConfigMap, DaemonSet, Namespace } from '../../imports/k8s';
import { StackProps } from '@aws-cdk/core';
import { Cluster, ServiceAccount } from '@aws-cdk/aws-eks';

export interface CloudWatchAgentProperties extends StackProps{
    environment: string,
    context: string,
    eksCluster: Cluster,
    namespace: string,
    serviceAccount: ServiceAccount
}

export class CloudWatchAgent extends Chart {


  constructor(scope: Construct, name: string, props: CloudWatchAgentProperties) {
  
    super(scope, name);

    const cwagentConfigMap = this.createCloudWatchAgentConfigMap(props);

    const cwAgentClusterRole = this.createRbacModel();
    const cwAgentClusterRoleBinding = new ClusterRoleBinding(this,'CloudWatchAgentClusterRoleBinding',{
        metadata:{
            name: "cloudwatch-agent-role-binding"
        },
        subjects:[
            {
                kind: "ServiceAccount",
                name: `${props.serviceAccount.serviceAccountName}`,
                namespace: `${props.namespace}`
        }],
        roleRef: {
            kind: `${cwAgentClusterRole.kind}`,
            name: `${cwAgentClusterRole.metadata.name}`,
            apiGroup: `rbac.authorization.k8s.io`
        }
    });
    cwAgentClusterRoleBinding.addDependency(cwAgentClusterRole);

    const daemonSet = this.createCloudWatchAgentDaemonSet(props);
  }

  protected createCloudWatchAgentConfigMap(props: CloudWatchAgentProperties): ConfigMap {
      return new ConfigMap(this,'CloudWatchAgentConfigMap',{
        metadata: {
            name: "cwagentconfig",
            namespace: `${props.namespace}`
        },
        "data": {
            "cwagentconfig.json": `{\n  \"logs\": {\n    \"metrics_collected\": {\n      \"kubernetes\": {\n        \"cluster_name\": \"${props.eksCluster.clusterName}\",\n        \"metrics_collection_interval\": 60\n      }\n    },\n    \"force_flush_interval\": 5\n  }\n}\n`
      }
    });
  }

  protected createCloudWatchAgentDaemonSet(props: CloudWatchAgentProperties): DaemonSet {
      return new DaemonSet(this,'CloudWatchAgentDaemonSet',{
          metadata: {
              name: "cloudwatch-agent",
              namespace: `${props.namespace}`
          },
          spec: {
            selector: {
              matchLabels: {
                name: "cloudwatch-agent"
              },
            },
          template: {
            metadata: {
              labels: {
                name: "cloudwatch-agent"
              },
            },
            spec: {
            containers: [
                {
                  name: "cloudwatch-agent",
                  image: "amazon/cloudwatch-agent:1.245315.0",
                  resources: {
                    limits: {
                      cpu: "200m",
                      memory: "200Mi"
                    },
                    requests: {
                      cpu: "200m",
                      memory: "200Mi"
                    }
                  },
                  env: [
                      {
                        name: "HOST_IP",
                        valueFrom: {
                          fieldRef: {
                            fieldPath: "status.hostIP"
                          }
                        }
                      },
                        {
                            name: "HOST_NAME",
                            valueFrom: {
                                fieldRef: {
                                    fieldPath: "spec.nodeName"
                                }
                            }
                        },
                        {
                            name: "K8S_NAMESPACE",
                            valueFrom: {
                                fieldRef: {
                                    fieldPath: "metadata.namespace"
                                }
                            }
                        },
                        {
                            name: "CI_VERSION",
                            value: "k8s/1.2.1"
                        }
                    ],
                    volumeMounts: [
                        {
                            name: "cwagentconfig",
                            mountPath: "/etc/cwagentconfig"
                        },
                        {
                            name: "rootfs",
                            mountPath: "/rootfs",
                            readOnly: true
                        },
                        {
                            name: "dockersock",
                            mountPath: "/var/run/docker.sock",
                            readOnly: true
                        },
                        {
                            name: "varlibdocker",
                            mountPath: "/var/lib/docker",
                            readOnly: true
                        },
                        {
                            name: "sys",
                            mountPath: "/sys",
                            readOnly: true
                        },
                        {
                            name: "devdisk",
                            mountPath: "/dev/disk",
                            readOnly: true
                        }
                    ]
                }
            ],
            volumes: [
                {
                    name: "cwagentconfig",
                    configMap: {
                        name: "cwagentconfig"
                    }
                },
                {
                    name: "rootfs",
                    hostPath: {
                        path: "/"
                    }
                },
                {
                    name: "dockersock",
                    hostPath: {
                        path: "/var/run/docker.sock"
                    }
                },
                {
                    name: "varlibdocker",
                    hostPath: {
                        path: "/var/lib/docker"
                    }
                },
                {
                    name: "sys",
                    hostPath: {
                        path: "/sys"
                    }
                },
                {
                    name: "devdisk",
                    hostPath: {
                        path: "/dev/disk/"
                    }
                }
            ],
            terminationGracePeriodSeconds: 60,
            serviceAccountName: "cloudwatch-agent"
          }
        }
      }
    });
  }

  protected createRbacModel(): ClusterRole{
      return new ClusterRole(this,'CloudWatchAgentRole',{
        metadata:{
          name: "cloudwatch-agent-role"
        },
        rules: [
            {
                apiGroups: [""],
                resources: ["pods", "nodes", "endpoints"],
                verbs: ["list", "watch"]
            },
            {
                apiGroups: ["apps"],
                resources: ["replicasets"],
                verbs: ["list", "watch"]
            },
            {
                apiGroups: ["batch"],
                resources: ["jobs"],
                verbs: ["list", "watch"]
            },
            {
                apiGroups: [""],
                resources: ["nodes/proxy"],
                verbs: ["get"]
            },
            {
                apiGroups: [""],
                resources: ["nodes/stats", "configmaps", "events"],
                verbs: ["create"]
            },
            {
                apiGroups: [""],
                resources: ["configmaps"],
                resourceNames: ["cwagent-clusterleader"],
                verbs: ["get","update"]
            }
        ]
      });
  }
}
