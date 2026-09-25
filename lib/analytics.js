'use strict';
const {store}=require('./store');
const {createAnalyticsEngine}=require('./analytics-core');
const {EVENTS}=require('./fit-analytics-schema');

const engine=createAnalyticsEngine({store,events:EVENTS});

module.exports={
  EVENTS,
  recordAnalytics:engine.recordAnalytics,
  removeAnalyticsDevice:engine.removeAnalyticsDevice,
  analyticsStats:engine.analyticsStats
};
