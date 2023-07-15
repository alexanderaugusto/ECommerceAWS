import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb"
import { v4 as uuid } from "uuid"
import * as AWSXRay from "aws-xray-sdk"
import { Lambda } from "aws-sdk"

AWSXRay.captureAWS(require("aws-sdk"))

export interface Product {
    id: string;
    productName: string;
    code: string;
    price: number;
    model: string;
    productUrl: string;
}

export enum ProductEventType {
    CREATED = "PRODUCT_CREATED",
    UPDATED = "PRODUCT_UPDATED",
    DELETED = "PRODUCT_DELETED"
}

export interface ProductEvent {
    requestId: string;
    eventType: ProductEventType;
    productId: string;
    productCode: string;
    productPrice: number;
    email: string;
}

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const handler = new ApiGatewayHandler(event, context);
    return await handler.handler();
}

class ApiGatewayHandler {
    private method: string;
    private apiRequestId: string;
    private lambdaRequestId: string;
    private dynamoDbHandler;
    private productEventHandler;

    constructor(private event: APIGatewayProxyEvent, private context: Context) {
        this.method = event.httpMethod;
        this.apiRequestId = event.requestContext.requestId;
        this.lambdaRequestId = context.awsRequestId;
        this.dynamoDbHandler = new DynamoDbHandler();
        this.productEventHandler = new ProductEventHandler();
    }

    async handler() {
        console.log(`API Gateway RequestId: ${this.apiRequestId} - Lambda RequestId: ${this.lambdaRequestId}`);

        if (this.event.resource === "/products") {
            if (this.method === "GET") {
                console.log('GET /products')
                return await this.getAllProducts();
            }
            else if (this.method === "POST") {
                console.log("POST /products")
                const product = JSON.parse(this.event.body!) as Product
                return await this.createProduct(product);
            }
        }
        else if (this.event.resource === "/products/{id}") {
            const productId = this.event.pathParameters!.id as string;

            if (this.method === "GET") {
                console.log(`GET /products/${productId}`)
                return await this.getProductById(productId);
            }
            else if (this.method === "PUT") {
                console.log(`PUT /products/${productId}`)
                const product = JSON.parse(this.event.body!) as Product
                return await this.updateProduct(productId, product);
            }
            else if (this.method === "DELETE") {
                console.log(`DELETE /products/${productId}`)
                return await this.deleteProduct(productId);
            }
        }

        return this.createResponse(400, {
            message: "Bad request",
            ApiGwRequestId: this.apiRequestId,
            LambdaRequestId: this.lambdaRequestId,
        });
    }

    async createProduct(product: Product) {
        product.id = uuid();
        // Execute the two promises in parallel (create product and send product event)
        const createPromise = this.dynamoDbHandler.createProduct(product);
        const sendProductPromise = this.productEventHandler.sendProductEvent(product, ProductEventType.CREATED, "alexander@inatel.br", this.lambdaRequestId)
        await Promise.all([createPromise, sendProductPromise])
        return this.createResponse(201, product);
    }

    async getAllProducts() {
        const products = await this.dynamoDbHandler.getAllProducts();
        return this.createResponse(200, products);
    }

    async getProductById(productId: string) {
        try {
            const product = await this.dynamoDbHandler.getProductById(productId);
            return this.createResponse(200, product);
        } catch (error) {
            console.error((<Error>error).message)
            return this.createResponse(404, {
                message: (<Error>error).message,
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId
            });
        }
    }

    async updateProduct(productId: string, product: Product) {
        try {
            const productUpdated = await this.dynamoDbHandler.updateProduct(productId, product);
            await this.productEventHandler.sendProductEvent(productUpdated, ProductEventType.UPDATED, "alexander@inatel.br", this.lambdaRequestId)
            return this.createResponse(200, productUpdated);
        } catch (ConditionalCheckFailedException) {
            return this.createResponse(404, {
                message: "Product not found",
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId
            });
        }
    }

    async deleteProduct(productId: string) {
        try {
            const productDeleted = await this.dynamoDbHandler.deleteProduct(productId);
            await this.productEventHandler.sendProductEvent(productDeleted, ProductEventType.DELETED, "alexander@inatel.br", this.lambdaRequestId)
            return this.createResponse(204, null);
        } catch (error) {
            console.error((<Error>error).message)
            return this.createResponse(404, {
                message: (<Error>error).message,
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId
            });
        }
    }

    createResponse(statusCode: number, body: any) {
        return {
            statusCode: statusCode,
            body: JSON.stringify(body),
        };
    }
}

class DynamoDbHandler {
    private ddbClient: DocumentClient;
    private productsDdb = process.env.PRODUCTS_DDB!

    constructor() {
        this.ddbClient = new DocumentClient();
    }

    async getAllProducts(): Promise<Product[]> {
        const data = await this.ddbClient.scan({
            TableName: this.productsDdb
        }).promise()

        return data.Items as Product[]
    }

    async getProductById(productId: string): Promise<Product> {
        const data = await this.ddbClient.get({
            TableName: this.productsDdb,
            Key: {
                id: productId
            }
        }).promise()

        if (data.Item) {
            return data.Item as Product
        }
        else {
            throw new Error('Product not found')
        }
    }

    async createProduct(product: Product): Promise<Product> {
        await this.ddbClient.put({
            TableName: this.productsDdb,
            Item: product
        }).promise()

        return product
    }

    async deleteProduct(productId: string): Promise<Product> {
        const data = await this.ddbClient.delete({
            TableName: this.productsDdb,
            Key: {
                id: productId
            },
            ReturnValues: "ALL_OLD"
        }).promise()

        if (data.Attributes) {
            return data.Attributes as Product
        }
        else {
            throw new Error('Product not found')
        }
    }

    async updateProduct(productId: string, product: Product): Promise<Product> {
        const data = await this.ddbClient.update({
            TableName: this.productsDdb,
            Key: {
                id: productId
            },
            ConditionExpression: 'attribute_exists(id)',
            ReturnValues: 'UPDATED_NEW',
            UpdateExpression: "set productName = :n, code = :c, price = :p, model = :m, productUrl = :u",
            ExpressionAttributeValues: {
                ":n": product.productName,
                ":c": product.code,
                ":p": product.price,
                ":m": product.model,
                ":u": product.productUrl
            }
        }).promise()

        data.Attributes!.id = productId

        return data.Attributes as Product
    }
}

class ProductEventHandler {
    private productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!;
    private lambdaClient;

    constructor() {
        this.lambdaClient = new Lambda();
    }

    sendProductEvent(product: Product, eventType: ProductEventType, email: string, lambdaRequestId: string) {
        const event: ProductEvent = {
            email: email,
            eventType: eventType,
            productCode: product.code,
            productId: product.id,
            productPrice: product.price,
            requestId: lambdaRequestId
        }

        return this.lambdaClient.invoke({
            FunctionName: this.productEventsFunctionName,
            Payload: JSON.stringify(event),
            InvocationType: "RequestResponse"
        }).promise()
    }
}