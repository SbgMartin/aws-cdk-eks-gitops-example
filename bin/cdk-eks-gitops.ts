#!/usr/bin/env node
import 'source-map-support/register';
import { App, Stack, Tags } from '@aws-cdk/core';
import { CdkEksGitOpsPipelineStack } from '../lib/aws-ci-cd-infra/cdk-eks-gitops-pipeline-stack';

class CdkEksGitOpsApp extends App{

    public readonly businessContext;
    public readonly toolsAccountContext;

    constructor(){

        super();

        this.businessContext = this.node.tryGetContext("common");
        
        //usually there is a dedicated service account for cross-cutting concerns - we call it tools account here
        this.toolsAccountContext = this.node.tryGetContext("tools");

        //create CI/CD environment
        const eksGitOpsPipelineStack = new CdkEksGitOpsPipelineStack(this, `${this.businessContext.longContext}`,{
            env: { account: this.toolsAccountContext.account, region: this.toolsAccountContext.region }
        });
        this.assignTagToStack(eksGitOpsPipelineStack);
    }

    assignTagToStack(existingStack: Stack){
        
        Tags.of(existingStack).add("environment", this.toolsAccountContext.environmentTag);
        Tags.of(existingStack).add("context", this.businessContext.longContext);
    }
}

//if this call is missing you receive an error during 'npx cdk synth' or 'yarn run cdk synth' command:
//  ENOENT: no such file or directory, open 'cdk.out/manifest.json'
new CdkEksGitOpsApp().synth();

