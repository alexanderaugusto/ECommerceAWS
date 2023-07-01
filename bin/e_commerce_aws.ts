#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/stacks/productsApp-stack';
import { ECommerceApiStack } from '../lib/stacks/ecommerceApi-stack';
import { EventsDdbStack } from '../lib/stacks/eventsDdb-stack';
import { ProductEventsFunctionStack } from '../lib/stacks/productEventsFunction-stack';

const app = new cdk.App();

const tags = {
  cost: "ECommerce",
  team: "Inatel",
}

const env: cdk.Environment = {
  account: "934167260976",
  region: "us-west-1"
}

const eventsDdbStack = new EventsDdbStack(app, "EventsDdb", {
  tags: tags,
  env: env
})

const productEventsFunctionStack = new ProductEventsFunctionStack(app,
  "ProductEventsFunction", {
  eventsDdb: eventsDdbStack.table,
  tags: tags,
  env: env
})
productEventsFunctionStack.addDependency(eventsDdbStack)

const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  tags: tags,
  env: env,
  productEventsFunction: productEventsFunctionStack.handler
})

const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApi", {
  productsHandler: productsAppStack.handler,
  tags: tags,
  env: env
})
eCommerceApiStack.addDependency(productsAppStack)