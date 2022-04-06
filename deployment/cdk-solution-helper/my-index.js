/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

// Imports
const fs = require('fs');
const _regex = /[\w]*AssetParameters/g; //this regular express also takes into account lambda functions defined in nested stacks

// Paths
const global_s3_assets = '../global-s3-assets';

// For each template in global_s3_assets ...
fs.readdirSync(global_s3_assets).forEach(file => {

    // Import and parse template file
    const raw_template = fs.readFileSync(`${global_s3_assets}/${file}`);
    let template = JSON.parse(raw_template);

    // Clean-up Lambda function code dependencies
    const resources = (template.Resources) ? template.Resources : {};
    const lambdaFunctions = Object.keys(resources).filter(function(key) {
      return resources[key].Type === "AWS::Lambda::Function";
    });
    lambdaFunctions.forEach(function(f) {
        console.log("process lambdaFunction " + f)
        const fn = template.Resources[f];
        if (fn.Properties.Code.hasOwnProperty('S3Bucket')) {
          // Set the S3 key reference
          let artifactHash
          if (fn.Properties.Code.S3Bucket.hasOwnProperty('Fn::Sub')){
            artifactHash = Object.assign(fn.Properties.Code.S3Bucket.S3Key);
            artifactHash = artifactHash.replace('\.zip', '');
          } else {
            artifactHash = Object.assign(fn.Properties.Code.S3Bucket.Ref);
            artifactHash = artifactHash.replace(_regex, '');
            artifactHash = artifactHash.substring(0, artifactHash.indexOf('S3Bucket'));
          }
          const assetPath = `asset${artifactHash}`;

          fn.Properties.Code.S3Key = `%%SOLUTION_NAME%%/%%VERSION%%/${assetPath}.zip`;
          // Set the S3 bucket reference
          fn.Properties.Code.S3Bucket = {
            'Fn::Sub': '%%BUCKET_NAME%%-${AWS::Region}'
          };
          // Set the handler
          const handler = fn.Properties.Handler;
          fn.Properties.Handler = `${assetPath}/${handler}`;
        }
    });

    // Clean-up Lambda Layer code dependencies
    const lambdaLayers = Object.keys(resources).filter(function (key) {
      return resources[key].Type === "AWS::Lambda::LayerVersion";
    })
    lambdaLayers.forEach(function (l) {
      const layer = template.Resources[l];
      if (layer.Properties.Content.hasOwnProperty('S3Bucket')) {
        let s3Key = Object.assign(layer.Properties.Content.S3Key);
        layer.Properties.Content.S3Key = `%%SOLUTION_NAME%%/%%VERSION%%/${s3Key}`;
        layer.Properties.Content.S3Bucket = {
          'Fn::Sub': '%%BUCKET_NAME%%-${AWS::Region}'
        }
      }
    })


    // For the below code to work with nested templates, the nested template file has to
    // be added as metadata to the construct in the CDK code.
    //
    // const myNestedTemplate = new MyNestedStack(this, 'NestedStack', {
    //     parameters: {
    //         "FirstParameter": <some parameter 1>,
    //         "SecondParameter": <some parameter 2>,
    //         "SolutionID": solutionID,
    //         "SolutionName": solutionName,
    //         "ParentStackName": Aws.STACK_NAME
    //     }
    // });
    //
    // The slice at the end of the statement is to remove the ".json" extension. Since all templates are published ".template"
    // myNestedTemplate.nestedStackResource!.addMetadata('nestedStackFileName', myNestedTemplate.templateFile.slice(0, -(".json".length)));
    //
    // The below block of code has been tested to work with single nesting levels. This block of code has not been tested for multilevel
    // nesting of stacks
    // nestedStacks.forEach(function(f) {
    //     const fn = template.Resources[f];
    //     fn.Properties.TemplateURL = {
    //          'Fn::Join': [
    //             '',
    //             [
    //                 'https://%%TEMPLATE_BUCKET_NAME%%.s3.',
    //                 {
    //                     'Ref' : 'AWS::URLSuffix'
    //                 },
    //                 '/',
    //                 `%%SOLUTION_NAME%%/%%VERSION%%/${fn.Metadata.nestedStackFileName}`
    //             ]
    //          ]
    //     };

    //     const params = fn.Properties.Parameters ? fn.Properties.Parameters : {};
    //     const nestedStackParameters = Object.keys(params).filter(function(key) {
    //         if (key.search(_regex) > -1) {
    //             return true;
    //         }
    //         return false;
    //     });

    //     nestedStackParameters.forEach(function(stkParam) {
    //         fn.Properties.Parameters[stkParam] = undefined;
    //     })
    // });

    // Clean-up parameters section
    const parameters = (template.Parameters) ? template.Parameters : {};
    const assetParameters = Object.keys(parameters).filter(function(key) {
      if (key.search(_regex) > -1) {
        return true;
      }
      return false;
    });
    assetParameters.forEach(function(a) {
        template.Parameters[a] = undefined;
    });

    // Output modified template file
    const output_template = JSON.stringify(template, null, 2);
    fs.writeFileSync(`${global_s3_assets}/${file}`, output_template);
});
