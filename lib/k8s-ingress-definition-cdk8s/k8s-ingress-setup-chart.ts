import { Construct } from 'constructs';
import { App, Chart } from 'cdk8s';
import { Deployment, Ingress, IngressRule, Namespace, Service } from '../../imports/k8s';


export class K8sBackendApplicationDefinitionChart extends Chart {

  constructor(scope: Construct, name: string) {
   
    super(scope, name);

    const appLabel = { app: "backend" };

    //first we need a new namespace for our backend application
    const namespace = new Namespace(this, 'BackendNamespace',{
     metadata: {
         name: "test-backend",
         labels: {
           workloadcategory : "test" 
        }
     }
    });

    const deployment = new Deployment(this, 'BackendDeployment', {
      metadata: {
        name: "backend-deployment",
        namespace: "test-backend"
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: appLabel
        },
        template: {
          metadata: { labels: appLabel },
          spec: {
            containers: [
              {
                name: 'hello-kubernetes',
                image: 'paulbouwer/hello-kubernetes:1.7',
                ports: [ { containerPort: 8080 } ]
              }
            ]
          }
        }
      }
    });
    
    //avoid kubectl apply before namespace has been created
    deployment.addDependency(namespace);


    const nodePortService = new Service(this, 'BackendNodePortService',{
        metadata:{
          name: "service-hello-kubernetes",
          namespace: "test-backend"
        },
        spec: {
          type: "NodePort",
          ports: [{ port: 80, targetPort: 8080 }],
          selector: appLabel,
        }
    });

    const backendServiceDefaultIngressRule: IngressRule = {
        http: {
        paths: [
            {
            path: "/*",
            backend: {
                serviceName: "service-hello-kubernetes",
                servicePort: 80
            }
            }
        ]
        }
    };

    const ingressDefinition = new Ingress(this, 'service-hello-kubernetes-ingress-rule', {
        metadata:{
          namespace: "test-backend",
          annotations: {
            [ "kubernetes.io/ingress.class" ]: "alb",
            [ "alb.ingress.kubernetes.io/scheme" ]: "internet-facing",
          }
        },
        spec:{
        rules: [ backendServiceDefaultIngressRule ]
        }
    });

  }
}