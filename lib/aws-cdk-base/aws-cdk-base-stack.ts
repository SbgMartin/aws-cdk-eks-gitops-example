import { countResourcesLike } from '@aws-cdk/assert';
import { Stack, CfnElement } from '@aws-cdk/core';

/**
 * In order to prefix all ressources with organizational information we defined a BaseStack for all
 * Constructs created within this AWS CDK application.
 *
 * Use `cdk --context environment=development context=demoproject` to set the prefix.
 * 
 * based on: https://github.com/aws-samples/aws-cdk-examples/blob/master/typescript/custom-logical-names/base-stack.ts
 */
export class BaseStack extends Stack {
 /* public allocateLogicalId(element: CfnElement) {
    const orig = super.allocateLogicalId(element);
    const environment = this.node.tryGetContext('environment');
    const context = this.node.tryGetContext('context');
    //return environment && context ? environment + context + orig : orig;
    return orig;
  }*/
}