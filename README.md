# AWS CDK Pipelines for EKS, AWS Container Insights, ALB Ingress Controller, Flux and CDK8S

This project contains resources which allow to learn about CDK Pipelines, AWS EKS with CDK as well as integration of CDK8S. Especially when it comes to application deployment for demo and learning purpose you'll find different variants how to specify Kubernetes Manifests (inline, file, CDK8S).

Also learning about Stack Dependencies is very important. Some lines of code are influencing the way how the Pipeline arranges the different actions - you'll find some comments inline (though they are polluting the implementation).

# Debugging

Please check the ./.vscode/launch.json file. It enables you to debug your AWS CDK application (given you are using VS Code).

# Vulnerability checking at design time

I personally use https://snyk.io/security-scanner-vuln-cost/ which is a community plugin for Snyk.io for vulnerability checking during development. Of course, there is a plethora of tools available - this one I can recommend as it's not blocking and mostly "invisible".

# How to use this code?

It's for reference and knowledge exchange. I am sharing this because some things are hard to find out and maybe someone has also some feedback (always appreciated :-)). You can also give it a try and clone it into a AWS CodeCommit Repository (then you need to either pass the name to yarn run cdk synth command as context parameter or store it directly in context.json). The first time you need to explicit run yarn cdk deploy --profile ... but be ware that your AWS Account needs to be bootstrapped with the latest version in order to support the new synthesis (also, check the context.json - there is plenty of blogs and documentation around what this is and why it's needed).

MultiAccount deployment is prepared but not fully implemented so far. Also Stages for Test and Prod are to be added.

Currently it's bound to eu-central-1 as there are some issues with lookup (at least in a lower version of CDK in conjunction with CDK Pipelines, need to verify if this is still the case). Change the AZ lookup here, if desired. 
https://github.com/SbgMartin/aws-cdk-eks-gitops-example/blob/eeb4c38cbb1a93097ce04e20818173bd25c3a284/lib/aws-core-infrastructure/base-network-stack.ts#L15

Before you do yarn cdk synth or similar, please look at https://github.com/SbgMartin/aws-cdk-eks-gitops-example/blob/b4e290da1888d9ccc459db2bd6672a19002cad30/cdk.json and either manually enter the values which are relevant to you or pass them as parameters within cdk synth command! Otherwise it will not synthesize.

## Step 1: create an AWS CodeCommit repository

Unlike the other examples which are around on the internet we use an AWS CodeCommit repository here. Please create it using a mechanism of choice (AWS CDK, AWS CLI or even manually). We do not have this included here primarily to decouple the lifecycle of CDK Pipelines and repository.

    aws codecommit create-repository --repository-name "cdk-gitops-demo" --repository-description "CDK Pipelines Demo" --profile <yourAwsProfileName>

As this is a needed reference for creating the AWS CodePipeline "SourceAction" you need to add it to cdk.json by replacing this template expression: ${YOUR_CODE_COMMIT_REPO_NAME}

## Step 2: connect to AWS CodeCommit repository

Ensure that you have cloned this GitHub repository and have "cd" into it.

Follow the instructions on this guide to connect to an AWS CodeCommit repository using your common git client: https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-https-unixes.html

After setting up your git client add the remote to the current git repository :

    git remote add awsrepo https://git-codecommit.{RegionWhereYourCodeCommitRepoResides}.amazonaws.com/v1/repos/cdk-gitops-demo

If you created your AWS CodeCommit repository with AWS CLI then you can reuse value of property "cloneUrlHttp" returned by creation API call.

In order to be able to push code to AWS CodeCommit you need to set the upstream:

    git push --set-upstream awsrepo master

Push the code to the AWS CodeCommit repo using

   git push awsrepo master

The code will appear on AWS CodeCommit repo.

## Step 3: adjust the AccountID and Region

For a starter keep everything in one single AWS Account, you can test multi-account later (is not finished, yet). To make things easy for just trying this and look at the results replace all Account and Region identifiers within cdk.json with your target account and region.

          "account": "${TOOLS_ACCOUNT}",
          "region": "${TOOLS_REGION}",

Do so at least for "Tools" and "Development".

    git commit -m 'some comment'
    git push awsrepo master

## Step 4: deploy

    yarn run cdk build
    yarn run cdk synth
    yarn run cdk deploy

Instead you can use npm, too. The AWS CodePipeline uses still yarn until you replace within PipelineStack definition

    synthAction: SimpleSynthAction.standardYarnSynth({

with

    synthAction: SimpleSynthAction.standardNpmSynth({

and the corresponding command.

For starting, leave it as is.

From now on each and every commit to the AWS CodeCommit repo will lead to an execution of the AWS CodePipeline behind.
# Stack-Naming

In order to get AWS CloudFormation StackNames which are expressive I went for a typical "Stage-Context" prefix. This is important if you deploy everything to one single AWS Account, so you see immediately if it's DEV, TEST or PROD. The "Context" is (at least to me) always an indicator of business need, purpose or relation to something expressive (e.g. BackendApplication; maybe not the most precise name but in this context it's the only app right now).

I experimented to influence the naming by implementing the method Stack.allocateLogicalId(), but finally I discarded this and chose the "Stage-Context" prefix.

# CDK Pipelines

Works pretty good for non-production use right now. The things are already known, like "delete the stacks created by the pipeline itself" must be added on mid-term. Right now you need to cleanup everything either via script or manually.

# Deterministic build and deployment infrastructure

Non-deterministic issues are our enemy, especially when using fast-evolving frameworks like AWS CDK et al. The CDK Pipeline is fixed to use the version which was used during development. Once I faced the issue that during development still an older version was valid, and during deployment the new one (I guess it was 1.65 or so) was released.

This is why you need to adjust the parameter once you upgrade to a newer CDK version. In the end we could move this to context, too - so far I did not bother about this, as there were much more challenging things to solve.

# AWS IAM Roles for K8s ServiceAccounts

All Kubernetes ServiceAccounts make use of AWS IAM Roles for ServiceAccounts to remove the need to give the WorkerNodeGroups too much permissions. It's pretty well supported by AWS CDK for EKS out of the box and did not need additional configuration.

# AWS Container Insights with CDK KubernetesManifest

For demo and learning purpose I created the relevant assets for setting up AWS Container Insights not with CDK8S, as it was not compatible when I started this off (which is beginning of October) and I also feel that for "knowing your tools" it's good to see alternatives. Then you recognize that in the end it doesn't matter where the Manifest comes from. To be honest, CDK8S is the most comfortable solution for creating new Manifests - but what about migrating existing solutions? I guess file upload has it's reason for being.

Be aware that the kubectl handling with the AWS Lambda functions is not comparable with the "look & feel" your current setup might have. The AWS Lambda functions which in the end do the kubectl apply -f command are only invoked once, and if you delete your deployment - your pipeline doesn't recreate it (that surprised me, to be honest).

## FluentD vs. FluentBit

In order to follow the official documentation I used FluentD for a starter, but will migrate to FluentBit in conjunction with AWS S3 sink (I do not want to spin up an expensive AWS ElasticSearch Service for my own evaluation purpose).

# CDK8S

In order to obtain proper types I used the CDK8S CLI in to generate them. The version here is Kubernetes 1.16 - I chose this version as it gives some more opportunity to evaluate cluster upgrade handling.

# AWS ALB Ingress with CDK8S

In order to check the integration between AWS CDK and CDK8S the ALB Ingress setup has been created with CDK8S. From all variants available within this repo, this is the most elegant one. But it's only about manifest creation. Eventually the same mechanism applies the manifest to your AWS EKS cluster despite the source (AWS Lambda function).

Please do not forget to cleanup the ALB created by the ALB Ingress Controller once you delete everything.

# Validating the setup - all good or need to rollback?

This is an important step within a mature CI/CD environment. The next step is to add a validation if the Ingress is working properly (an HTTP based service relies more or less on everything we created; AWS Container Insights is a separate story). This needs some additional resources as the ALB is managed by ALB Ingress Controller and not by AWS CDK or AWS CloudFormation.

# GitOps in the name - why? 

Flux is still missing, for this I need to add an additional hour to incorporate the HELM chart. But from prio perspective the validation step is more important right now - and I still need work later on ;-)




