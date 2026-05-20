targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@secure()
@description('Secret key for saving trip progress (use in your private bookmark URL)')
param writeKey string

var suffix = uniqueString(resourceGroup().id)
var storageAccountName = 'rtmap${suffix}'
var functionAppName = 'rtmap-sync-${suffix}'
var hostingPlanName = 'rtmap-plan-${suffix}'
var deploymentContainerName = 'deployment'
var liveStateContainerName = 'trip'
var liveStateBlobName = 'live-state.json'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [ '*' ]
          allowedMethods: [ 'GET', 'HEAD', 'OPTIONS' ]
          allowedHeaders: [ '*' ]
          exposedHeaders: [ '*' ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource tripContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: liveStateContainerName
  properties: {
    publicAccess: 'Blob'
  }
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: hostingPlanName
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp,linux'
  properties: {
    reserved: true
  }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [ '*' ]
      }
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'WRITE_KEY'
          value: writeKey
        }
        {
          name: 'LIVE_STATE_CONTAINER'
          value: liveStateContainerName
        }
        {
          name: 'LIVE_STATE_BLOB'
          value: liveStateBlobName
        }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'AzureWebJobsStorage'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '24'
      }
    }
  }
  dependsOn: [
    deploymentContainer
    tripContainer
  ]
}

output storageAccountName string = storageAccount.name
output liveStateUrl string = 'https://${storageAccount.name}.blob.${environment().suffixes.storage}/${liveStateContainerName}/${liveStateBlobName}'
output functionAppName string = functionApp.name
output tripSyncApiUrl string = 'https://${functionApp.properties.defaultHostName}/api/trip-state'
