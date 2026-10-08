'use strict';

/* Canonical AppBase payment-method policy.
   Provider adapters describe how to talk to a provider; this file describes where a
   provider is allowed to be offered. BillingRouter and shared Admin both read this one
   source so product screens cannot drift from store/regional policy. */

const POLICIES = Object.freeze({
  apple:Object.freeze({
    id:'apple',
    platforms:Object.freeze(['ios']),
    distributions:Object.freeze(['app_store']),
    countries:Object.freeze([]),
    excludeCountries:Object.freeze([]),
    external:false
  }),
  google_play:Object.freeze({
    id:'google_play',
    platforms:Object.freeze(['android']),
    distributions:Object.freeze(['google_play']),
    countries:Object.freeze([]),
    excludeCountries:Object.freeze([]),
    external:false
  }),
  stripe:Object.freeze({
    id:'stripe',
    platforms:Object.freeze(['web','android','ios']),
    distributions:Object.freeze(['web','direct']),
    countries:Object.freeze([]),
    excludeCountries:Object.freeze([]),
    external:true
  }),
  yookassa:Object.freeze({
    id:'yookassa',
    platforms:Object.freeze(['web','android','ios']),
    distributions:Object.freeze(['web','direct']),
    countries:Object.freeze(['RU']),
    excludeCountries:Object.freeze([]),
    external:true
  })
});

const cleanList = value => Array.isArray(value) ? value.map(String) : [];

function billingProviderPolicy(provider){
  const raw = POLICIES[String(provider || '')];
  if(!raw) return null;
  return {
    id:raw.id,
    platforms:[...raw.platforms],
    distributions:[...raw.distributions],
    countries:[...raw.countries],
    excludeCountries:[...raw.excludeCountries],
    external:!!raw.external
  };
}

function listAllows(value, list){
  return !list.length || list.includes(value);
}

function billingPolicySupports(provider, context){
  const policy = billingProviderPolicy(provider);
  if(!policy) return true;
  context = context && typeof context === 'object' ? context : {};
  const platform = String(context.platform || 'unknown');
  const distribution = String(context.distribution || 'unknown');
  const country = String(context.country || '').toUpperCase();

  if(!listAllows(platform, cleanList(policy.platforms))) return false;
  if(!listAllows(distribution, cleanList(policy.distributions))) return false;
  if(policy.countries.length && (!country || !policy.countries.includes(country))) return false;
  if(policy.excludeCountries.length && country && policy.excludeCountries.includes(country)) return false;
  return true;
}

function billingPolicyList(){
  return Object.keys(POLICIES).map(billingProviderPolicy);
}

module.exports = { billingProviderPolicy, billingPolicySupports, billingPolicyList };
