import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult, Context } from "aws-lambda";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import * as AWSXRay from "aws-xray-sdk";

AWSXRay.captureAWS(require("aws-sdk"))

export interface OrderEventDdb {
    pk: string;
    sk: string;
    ttl: number;
    email: string;
    createdAt: number;
    requestId: string;
    eventType: string;
    info: {
        orderId: string;
        productCodes: string[];
        messageId: string;
    }
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

        if (this.event.resource == "/orders/events") {
            if (this.method == "GET") {
                console.log('GET /orders/events')
                return await this.getOrderEvents(this.event.queryStringParameters);
            }
        }

        return this.createResponse(400, {
            message: "Bad request",
            ApiGwRequestId: this.apiRequestId,
            LambdaRequestId: this.lambdaRequestId,
        });
    }

    async getOrderEvents(queryStringParameters: APIGatewayProxyEventQueryStringParameters | null) {
        try {
            const email = queryStringParameters!.email!
            const eventType = queryStringParameters!.eventType!

            if (email) {
                if (eventType) {
                    const ordeEvents = await this.dynamoDbHandler.getOrderEventsByEmailAndEventType(email, eventType)
                    return this.createResponse(200, this.convertOrderEvents(ordeEvents));
                }
                else {
                    const ordeEvents = await this.dynamoDbHandler.getOrderEventsByEmail(email)
                    return this.createResponse(200, this.convertOrderEvents(ordeEvents));
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
                LambdaRequestId: this.lambdaRequestId
            });
        }
    }

    convertOrderEvents(orderEvents: OrderEventDdb[]) {
        return orderEvents.map((orderEvent) => {
            return {
                email: orderEvent.email,
                createdAt: orderEvent.createdAt,
                eventType: orderEvent.eventType,
                requestId: orderEvent.requestId,
                orderId: orderEvent.info.orderId,
                productCodes: orderEvent.info.productCodes
            }
        })
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
    private eventsDdb = process.env.EVENTS_DDB!

    constructor() {
        this.ddbClient = new DocumentClient();
    }

    async getOrderEventsByEmailAndEventType(email: string, eventType: string): Promise<OrderEventDdb[]> {
        const data = await this.ddbClient.query({
            TableName: this.eventsDdb,
            IndexName: 'emailIdx',
            KeyConditionExpression: 'email = :email AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: {
                ':email': email,
                ':prefix': eventType
            }
        }).promise()

        return data.Items as OrderEventDdb[]
    }

    async getOrderEventsByEmail(email: string): Promise<OrderEventDdb[]> {
        const data = await this.ddbClient.query({
            TableName: this.eventsDdb,
            IndexName: 'emailIdx',
            KeyConditionExpression: 'email = :email AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: {
                ':email': email,
                ':prefix': 'ORDER_'
            }
        }).promise()

        return data.Items as OrderEventDdb[]
    }
}