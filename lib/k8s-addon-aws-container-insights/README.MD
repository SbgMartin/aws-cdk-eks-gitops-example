# Origin of manifests

wget https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/cloudwatch-namespace.yaml


# cdk-gitops-eks

        //the AWS Code* assets are usually created within a AWS Service/Tools Account (created by Landing Zone)
        //here we assume there is only one single AWS Account for everything (otherwise extend this example with additional Accounts
        //but do not forget the trust on bootstrapping phase)


# CdkEksGitOpsPipelineStack

- prepared for multi-account
- development stage
- test stage
- production stage
- orchestration from tools account
- also possible to remove this configuration or just use the same account number for all stages