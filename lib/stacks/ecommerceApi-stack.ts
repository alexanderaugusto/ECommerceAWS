
import * as cdk from 'aws-cdk-lib';
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import { Construct } from 'constructs';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cwlogs from "aws-cdk-lib/aws-logs";

interface ECommerceApiStackProps extends cdk.StackProps {
    productsHandler: lambdaNodeJS.NodejsFunction,
    ordersHandler: lambdaNodeJS.NodejsFunction,
}

export class ECommerceApiStack extends cdk.Stack {
    public readonly urlOutput: cdk.CfnOutput;

    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super(scope, id, props);

        const api = this.createApiGateway();

        this.integrateProductsLambdaFunctionWithApiGateway(api, props.productsHandler);
        this.integrateOrdersLambdaFunctionWithApiGateway(api, props.ordersHandler);
        this.urlOutput = new cdk.CfnOutput(this, "url", {
            exportName: "url",
            value: api.url,
        });
    }

    createApiGateway() {
        const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs");

        return new apigateway.RestApi(this, "ecommerce-api", {
            restApiName: "ECommerce Service",
            description: "This is the ECommerce service",
            cloudWatchRole: true,
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    caller: true,
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    user: true,
                }),
            },
        });
    }

    integrateProductsLambdaFunctionWithApiGateway(api: apigateway.RestApi, lambdaFunction: lambdaNodeJS.NodejsFunction) {
        const productsFunctionIntegration = new apigateway.LambdaIntegration(lambdaFunction);
        this.createProductsApiResources(api, productsFunctionIntegration);
    }

    integrateOrdersLambdaFunctionWithApiGateway(api: apigateway.RestApi, lambdaFunction: lambdaNodeJS.NodejsFunction) {
        const ordersFunctionIntegration = new apigateway.LambdaIntegration(lambdaFunction);
        this.createOrdersApiResources(api, ordersFunctionIntegration);
    }

    createProductsApiResources(api: apigateway.RestApi, productsFunctionIntegration: cdk.aws_apigateway.LambdaIntegration) {
        const productsResource = api.root.addResource("products");
        productsResource.addMethod("POST", productsFunctionIntegration, this.addProductValidator(api, "ProductCreateRequestValidator", "CreateProductModel", "Product create request validator"));
        productsResource.addMethod("GET", productsFunctionIntegration);

        const productIdResource = productsResource.addResource("{id}");
        productIdResource.addMethod("GET", productsFunctionIntegration);
        productIdResource.addMethod("PUT", productsFunctionIntegration, this.addProductValidator(api, "ProductUpdateRequestValidator", "UpdateProductModel", "Product update request validator"));
        productIdResource.addMethod("DELETE", productsFunctionIntegration);
    }

    createOrdersApiResources(api: apigateway.RestApi, ordersFunctionIntegration: cdk.aws_apigateway.LambdaIntegration) {
        const ordersResource = api.root.addResource("orders");
        ordersResource.addMethod("POST", ordersFunctionIntegration, this.addCreateOrderValidator(api));
        ordersResource.addMethod("GET", ordersFunctionIntegration);
        ordersResource.addMethod("DELETE", ordersFunctionIntegration, this.addDeleteOrderValidator());
    }

    addProductValidator(api: apigateway.RestApi, validatorName: string, modelName: string, requestValidatorName: string) {
        const productRequestValidator = new apigateway.RequestValidator(this, validatorName, {
            restApi: api,
            requestValidatorName: requestValidatorName,
            validateRequestBody: true,
        })

        const productModel = new apigateway.Model(this, modelName, {
            modelName: modelName,
            restApi: api,
            contentType: "application/json",
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    productName: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    code: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    price: {
                        type: apigateway.JsonSchemaType.NUMBER
                    },
                    model: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    productUrl: {
                        type: apigateway.JsonSchemaType.STRING
                    }
                },
                required: [
                    "productName",
                    "code"
                ]
            }
        })

        return {
            requestValidator: productRequestValidator,
            requestModels: { "application/json": productModel }
        }
    }

    addCreateOrderValidator(api: apigateway.RestApi) {
        const orderRequestValidator = new apigateway.RequestValidator(this, "OrderRequestValidator", {
            restApi: api,
            requestValidatorName: `Order request validator`,
            validateRequestBody: true,
        })

        const orderModel = new apigateway.Model(this, "OrderModel", {
            modelName: "OrderModel",
            restApi: api,
            contentType: "application/json",
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    email: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    productIds: {
                        type: apigateway.JsonSchemaType.ARRAY,
                        minItems: 1,
                        items: {
                            type: apigateway.JsonSchemaType.STRING
                        }
                    },
                    payment: {
                        type: apigateway.JsonSchemaType.STRING,
                        enum: ["CASH", "DEBIT_CARD", "CREDIT_CARD"]
                    }
                },
                required: [
                    "email",
                    "productIds",
                    "payment"
                ]
            }
        })

        return {
            requestValidator: orderRequestValidator,
            requestModels: { "application/json": orderModel }
        }
    }

    addDeleteOrderValidator() {
        return {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.orderId': true
            },
            requestValidatorOptions: {
                requestValidatorName: "Email and OrderId parameters validator",
                validateRequestParameters: true
            }
        };
    }
}