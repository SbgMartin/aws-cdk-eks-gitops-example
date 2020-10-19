import { expect as expectCDK, matchTemplate, MatchStyle, SynthUtils } from '@aws-cdk/assert';
import { Stack } from '@aws-cdk/core';
import { CdkEksGitOpsPipelineStack } from '../lib/aws-ci-cd-infra/cdk-eks-gitops-pipeline-stack';

//@ToDo: add snapshot tests for each stack
//@ToDo: check output compatibility for different ci platforms

// Snapshot Test as baseline for AWS CodePipeline creation
test('CI/CD Test Stack', () => {
    
  const stack = new Stack();
  new CdkEksGitOpsPipelineStack(stack,'CdkEksGitOpsPipelineStackUnitTest',{});
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
