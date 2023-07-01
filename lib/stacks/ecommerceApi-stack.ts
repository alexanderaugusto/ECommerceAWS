// Purpose: Defines the ECommerceApiStack class. This class is used to create the API Gateway and Lambda functions for the ECommerce service.
import * as cdk from 'aws-cdk-lib';
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import { Construct } from 'constructs';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cwlogs from "aws-cdk-lib/aws-logs";

// Purpose: Defines the properties for the ECommerceApiStack class.
interface ECommerceApiStackProps extends cdk.StackProps {
    productsHandler: lambdaNodeJS.NodejsFunction // lambda function handler for the products function
}

export class ECommerceApiStack extends cdk.Stack {
    public readonly urlOutput: cdk.CfnOutput; // the URL of the API Gateway

    // scope: Construct - the parent construct
    // id: string - the logical ID of the construct within the parent construct
    // props: ECommerceApiStackProps - stack properties
    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super(scope, id, props);

        // create the API Gateway
        const api = this.createApiGateway();

        this.integrateLambdaFunctionWithApiGateway(api, props.productsHandler); // integrate the products function with the API Gateway

        // create an output for the URL of the API Gateway
        this.urlOutput = new cdk.CfnOutput(this, "url", {
            exportName: "url", // name of the output
            value: api.url, // value of the output
        });
    }

    createApiGateway() {
        const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs"); // create a log group for the API Gateway

        return new apigateway.RestApi(this, "ecommerce-api", {
            restApiName: "ECommerce Service", // name of the API Gateway at AWS
            description: "This is the ECommerce service", // description of the API Gateway at AWS
            cloudWatchRole: true, // create a CloudWatch role for API Gateway
            deployOptions: { // deployment options
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup), // log group for the API Gateway
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({ // log format
                    caller: true, // log the caller. true: log the caller - false: do not log the caller
                    httpMethod: true, // log the HTTP method. true: log the HTTP method - false: do not log the HTTP method
                    ip: true, // log the IP address. true: log the IP address - false: do not log the IP address
                    protocol: true, // log the protocol. true: log the protocol - false: do not log the protocol
                    requestTime: true, // log the request time. true: log the request time - false: do not log the request time
                    resourcePath: true, // log the resource path. true: log the resource path - false: do not log the resource path
                    responseLength: true, // log the response length. true: log the response length - false: do not log the response length
                    status: true, // log the status. true: log the status - false: do not log the status
                    user: true, // log the user. true: log the user - false: do not log the user
                }),
            },
        });
    }

    integrateLambdaFunctionWithApiGateway(api: apigateway.RestApi, lambdaFunction: lambdaNodeJS.NodejsFunction) {
        const productsFunctionIntegration = new apigateway.LambdaIntegration(lambdaFunction); // create an integration for the products function
        this.createApiResources(api, productsFunctionIntegration);
    }

    createApiResources(api: apigateway.RestApi, productsFunctionIntegration: cdk.aws_apigateway.LambdaIntegration) {
        const productsResource = api.root.addResource("products"); // create a resource for the products function
        productsResource.addMethod("POST", productsFunctionIntegration); // add a POST method to the products resource
        productsResource.addMethod("GET", productsFunctionIntegration); // add a GET method to the products resource

        const productIdResource = productsResource.addResource("{id}"); // create a resource for the product function
        productIdResource.addMethod("GET", productsFunctionIntegration); // add a GET method to the product resource
        productIdResource.addMethod("PUT", productsFunctionIntegration); // add a PUT method to the product resource
        productIdResource.addMethod("DELETE", productsFunctionIntegration); // add a DELETE method to the product resource
    }
}