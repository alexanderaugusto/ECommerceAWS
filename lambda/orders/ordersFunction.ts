import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult, Context } from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { v4 as uuid } from "uuid";
import * as AWSXRay from "aws-xray-sdk";

AWSXRay.captureAWS(require("aws-sdk"))

export interface OrderProduct {
    code: string,
    price: number,
}

export enum PaymentType {
    CASH = "CASH",
    DEBIT_CARD = "DEBIT_CARD",
    CREDIT_CARD = "CREDIT_CARD"
}

export enum ShippingType {
    ECONOMIC = "ECONOMIC",
    URGENT = "URGENT"
}

export enum CarrierType {
    CORREIOS = "CORREIOS",
    FEDEX = "FEDEX"
}

export interface OrderRequest {
    email: string,
    productIds: string[],
    payment: PaymentType,
    shipping: {
        type: ShippingType,
        carrier: CarrierType
    }
}

export interface OrderProductResponse {
    code: string,
    price: number
}

export interface OrderResponse {
    email: string,
    id: string,
    createdAt: number,
    billing: {
        payment: PaymentType,
        totalPrice: number
    },
    shipping: {
        type: ShippingType,
        carrier: CarrierType
    },
    products?: OrderProductResponse[]
}

export interface Order {
    pk: string,
    sk: string,
    createdAt: number,
    shipping: {
        type: ShippingType,
        carrier: CarrierType
    },
    billing: {
        payment: PaymentType,
        totalPrice: number
    },
    products?: OrderProduct[]
}

export interface Product {
    id: string;
    productName: string;
    code: string;
    price: number;
    model: string;
    productUrl: string;
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

    constructor(private event: APIGatewayProxyEvent, private context: Context) {
        this.method = event.httpMethod;
        this.apiRequestId = event.requestContext.requestId;
        this.lambdaRequestId = context.awsRequestId;
        this.dynamoDbHandler = new DynamoDbHandler();
    }

    async handler() {
        console.log(`API Gateway RequestId: ${this.apiRequestId} - Lambda RequestId: ${this.lambdaRequestId}`);

        if (this.event.resource === "/orders") {
            if (this.method === "GET") {
                console.log('GET /orders')
                return await this.getOrders(this.event.queryStringParameters);
            }
            else if (this.method === "POST") {
                console.log("POST /orders")
                const orderRequest = JSON.parse(this.event.body!) as OrderRequest
                return await this.createOrder(orderRequest);
            }
            else if (this.method === "DELETE") {
                console.log("DELETE /orders")
                return await this.deleteOrder(this.event.queryStringParameters);
            }
        }

        return this.createResponse(400, {
            message: "Bad request",
            ApiGwRequestId: this.apiRequestId,
            LambdaRequestId: this.lambdaRequestId,
        });
    }

    async createOrder(orderRequest: OrderRequest) {
        const products = await this.dynamoDbHandler.getProductsByIds(orderRequest.productIds)

        if (products.length == orderRequest.productIds.length) {
            const order = this.buildOrder(orderRequest, products)
            const orderCreated = await this.dynamoDbHandler.createOrder(order)
            return this.createResponse(201, this.convertToOrderResponse(orderCreated))
        }
        else {
            return this.createResponse(404, {
                message: "Some product was not found",
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId,
            });
        }
    }

    async getOrders(queryStringParameters: APIGatewayProxyEventQueryStringParameters | null) {
        try {
            if (!queryStringParameters) {
                const orders = await this.dynamoDbHandler.getAllOrders()
                return this.createResponse(200, orders.map(this.convertToOrderResponse));
            }

            if (queryStringParameters.email) {
                if (queryStringParameters.orderId) {
                    const order = await this.dynamoDbHandler.getOrdersByEmailAndOrderId(queryStringParameters.email, queryStringParameters.orderId)
                    return this.createResponse(200, this.convertToOrderResponse(order));
                }
                else {
                    const orders = await this.dynamoDbHandler.getOrdersByEmail(queryStringParameters.email)
                    return this.createResponse(200, orders.map(this.convertToOrderResponse));
                }
            }

            return this.createResponse(400, {
                message: "Bad request",
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId,
            });
        }
        catch (error) {
            console.log((<Error>error).message)

            return this.createResponse(404, {
                message: (<Error>error).message,
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId,
            });
        }
    }

    async deleteOrder(queryStringParameters: APIGatewayProxyEventQueryStringParameters | null) {
        try {
            if (queryStringParameters && queryStringParameters.email && queryStringParameters.orderId) {
                await this.dynamoDbHandler.deleteOrder(queryStringParameters.email, queryStringParameters.orderId)
                return this.createResponse(204, null);
            }
            else {
                return this.createResponse(400, {
                    message: "Bad request",
                    ApiGwRequestId: this.apiRequestId,
                    LambdaRequestId: this.lambdaRequestId,
                });
            }
        }
        catch (error) {
            console.log((<Error>error).message)

            return this.createResponse(404, {
                message: (<Error>error).message,
                ApiGwRequestId: this.apiRequestId,
                LambdaRequestId: this.lambdaRequestId,
            });
        }
    }

    buildOrder(orderRequest: OrderRequest, products: Product[]): Order {
        const orderProducts: OrderProductResponse[] = []

        let totalPrice = 0

        products.forEach((product) => {
            totalPrice += product.price
            orderProducts.push({
                code: product.code,
                price: product.price
            })
        })

        const order: Order = {
            pk: orderRequest.email,
            sk: uuid(),
            createdAt: Date.now(),
            billing: {
                payment: orderRequest.payment,
                totalPrice: totalPrice
            },
            shipping: {
                type: orderRequest.shipping.type,
                carrier: orderRequest.shipping.carrier
            },
            products: orderProducts
        }

        return order
    }

    convertToOrderResponse(order: Order): OrderResponse {
        const orderProducts: OrderProductResponse[] = []

        order.products?.forEach((product) => {
            orderProducts.push({
                code: product.code,
                price: product.price
            })
        })

        const orderResponse: OrderResponse = {
            email: order.pk,
            id: order.sk!,
            createdAt: order.createdAt!,
            products: orderProducts.length ? orderProducts : undefined,
            billing: {
                payment: order.billing.payment as PaymentType,
                totalPrice: order.billing.totalPrice
            },
            shipping: {
                type: order.shipping.type as ShippingType,
                carrier: order.shipping.carrier as CarrierType
            }
        }

        return orderResponse
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
    private ordersDdb = process.env.ORDERS_DDB!
    private productsDdb = process.env.PRODUCTS_DDB!

    constructor() {
        this.ddbClient = new DocumentClient();
    }

    async createOrder(order: Order): Promise<Order> {
        await this.ddbClient.put({
            TableName: this.ordersDdb,
            Item: order
        }).promise()

        return order
    }

    async getAllOrders(): Promise<Order[]> {
        const data = await this.ddbClient.scan({
            TableName: this.ordersDdb,
        }).promise()
        return data.Items as Order[]
    }

    async getOrdersByEmail(email: string): Promise<Order[]> {
        const data = await this.ddbClient.query({
            TableName: this.ordersDdb,
            KeyConditionExpression: "pk = :email",
            ExpressionAttributeValues: {
                ":email": email
            },
        }).promise()

        return data.Items as Order[]
    }

    async getOrdersByEmailAndOrderId(email: string, orderId: string): Promise<Order> {
        const data = await this.ddbClient.get({
            TableName: this.ordersDdb,
            Key: {
                pk: email,
                sk: orderId
            },
        }).promise()

        if (data.Item) {
            return data.Item as Order
        }
        else {
            throw new Error('Order not found')
        }
    }

    async deleteOrder(email: string, orderId: string): Promise<Order> {
        const data = await this.ddbClient.delete({
            TableName: this.ordersDdb,
            Key: {
                pk: email,
                sk: orderId
            },
            ReturnValues: "ALL_OLD"
        }).promise()

        if (data.Attributes) {
            return data.Attributes as Order
        }
        else {
            throw new Error('Order not found')
        }
    }

    async getProductsByIds(productIds: string[]): Promise<Product[]> {
        const keys: { id: string; }[] = []

        productIds.forEach((productId) => {
            keys.push({
                id: productId
            })
        })

        const data = await this.ddbClient.batchGet({
            RequestItems: {
                [this.productsDdb]: {
                    Keys: keys
                }
            }
        }).promise()

        return data.Responses![this.productsDdb] as Product[]
    }
}
