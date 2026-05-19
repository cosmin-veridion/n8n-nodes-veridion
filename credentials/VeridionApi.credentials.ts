import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class VeridionApi implements ICredentialType {
	name = 'veridionApi';
	displayName = 'Veridion API';
	documentationUrl = 'https://developer.veridion.com/docs/getting-started';
	icon = 'file:../nodes/Veridion/veridion.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'The API key from your Veridion account (x-api-key header)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://data.veridion.com',
			url: '/match/v5/companies',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			// Minimal valid body to validate the key — expect 200 or 202, not 401/403
			body: JSON.stringify({ legal_names: ['Acme Corporation'] }),
		},
	};
}
