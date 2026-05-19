targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@secure()
@description('Secret key for saving trip progress (use in your private bookmark URL)')
param writeKey string

var suffix = uniqueString(resourceGroup().id)
var storageAccountName = 'rtmap${suffix}'
var functionAppName = 'rtmap-sync-${suffix}'

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
}

resource tripContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'trip'
  properties: {
    publicAccess: 'Blob'
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'rtmap-plan-${suffix}'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
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
      linuxFxVersion: 'NODE|24'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: storageConnectionString
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~24'
        }
        {
          name: 'WRITE_KEY'
          value: writeKey
        }
        {
          name: 'LIVE_STATE_CONTAINER'
          value: 'trip'
        }
        {
          name: 'LIVE_STATE_BLOB'
          value: 'live-state.json'
        }
      ]
    }
  }
}

output storageAccountName string = storageAccount.name
output liveStateUrl string = 'https://${storageAccount.name}.blob.${environment().suffixes.storage}/trip/live-state.json'
output functionAppName string = functionApp.name
output tripSyncApiUrl string = 'https://${functionApp.properties.defaultHostName}/api/trip-state'
