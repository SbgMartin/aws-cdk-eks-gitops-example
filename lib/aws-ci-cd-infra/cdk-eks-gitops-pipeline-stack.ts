import { Artifact } from '@aws-cdk/aws-codepipeline';
import { CodeCommitSourceAction, CodeCommitTrigger } from '@aws-cdk/aws-codepipeline-actions';
import { Repository } from '@aws-cdk/aws-codecommit';
import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { ShellScriptAction } from '@aws-cdk/pipelines'; //needed for curl command execution during validation phase
import { CdkEksGitOpsSetupStage } from './cdk-eks-gitops-setup-stage';

interface CdkEksGitOpsPipelineStackProperties extends StackProps {
}

export class CdkEksGitOpsPipelineStack extends Stack {

    public readonly businessContext = this.node.tryGetContext("common");
    public readonly devAccountContext = this.node.tryGetContext("development");
    public readonly testAccountContext = this.node.tryGetContext("test");
    public readonly prodAccountContext = this.node.tryGetContext("production");

    
    constructor(scope: Construct, id: string, props: CdkEksGitOpsPipelineStackProperties) {
    super(scope, id, props);

    const sourceArtifact = new Artifact();
    const cloudAssemblyArtifact = new Artifact();
    const sourceOutput = new Artifact();
 
    //the Repository is being created beforehand as otherwise in case of cdk destroy this nice repo is deleted, too
    const repository = Repository.fromRepositoryName(this, "GitOpsDemoRepo", `${this.businessContext.repositoryName}`);

    const pipeline = new CdkPipeline(this, 'Pipeline', {
      pipelineName: 'GitOpsDemoInfraPipeline',
      cloudAssemblyArtifact,
      cdkCliVersion: '1.68.0', //deterministic build-infra (fixed with #10659 issue on GitHub)

      sourceAction: new CodeCommitSourceAction({
        actionName: 'CodeCommit',
        repository,
        branch: 'master',
        trigger: CodeCommitTrigger.EVENTS,
        output: sourceOutput,
      }),

      synthAction: SimpleSynthAction.standardYarnSynth({
        sourceArtifact: sourceOutput,
        cloudAssemblyArtifact,
          
        buildCommand: 'yarn run build'
        }),
      });

      //Stage to deploy all relevant stacks to development account
      const devStageDeployment = new CdkEksGitOpsSetupStage(this, `${this.devAccountContext.shortPrefix}-${this.businessContext.longContext}`, {
        env: { account: this.devAccountContext.account, region: this.devAccountContext.region },
        environment: this.devAccountContext.shortPrefix,
        context: this.businessContext.longContext
      });

      pipeline.addApplicationStage(devStageDeployment);

      //ToDo: validation step needed with automated approval - precondition for next stage to execute

      //ToDo: deploy to other stage
/*
      //Stage to deploy all relevant stacks to test account, e.g. for user-acceptance-test
      const testStageDeployment = new CdkEksGitOpsSetupStage(this, `${this.testAccountContext.shortPrefix}-${this.businessContext.longContext}`, {
        env: { account: this.testAccountContext.account, region: this.testAccountContext.region },
        environment: this.testAccountContext.shortPrefix,
        context: this.businessContext.longContext
      });

      pipeline.addApplicationStage(testStageDeployment);

      //ToDo: validation step needed with manual approval - precondition for next stage to execute

      //Next is to deploy to Production Environment
      const prodStageDeployment = new CdkEksGitOpsSetupStage(this, `${this.prodAccountContext.shortPrefix}-${this.businessContext.longContext}`, {
        env: { account: this.prodAccountContext.account, region: this.prodAccountContext.region },
        environment: this.prodAccountContext.shortPrefix,
        context: this.businessContext.longContext
      });

      pipeline.addApplicationStage(prodStageDeployment);
*/
  }
}