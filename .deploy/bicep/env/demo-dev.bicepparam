using '../main.bicep'
extends '_root.bicepparam'

param environment = 'dev'
param tags = {
  team: 'arid-nova'
  persistent: 'false'
}
