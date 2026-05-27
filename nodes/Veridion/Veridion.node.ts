import {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VeridionIdentifiers {
	legal_names?: string[];
	commercial_names?: string[];
	address_txt?: string;
	website?: string;
	phone_number?: string;
	registry_id?: string;
}

interface VeridionMatchBody {
	identifiers: VeridionIdentifiers;
}

interface VeridionSearchBody extends IDataObject {
	filters: IDataObject;
}

interface VeridionIndustryEntry {
	name?: string;
	type?: string;
	children?: VeridionIndustryEntry[];
}

// Extends IDataObject so n8n's INodeExecutionData.json accepts it directly
interface VeridionNoMatchResponse extends IDataObject {
	matched: false;
	reason: string;
}

// ─── Node definition ────────────────────────────────────────────────────────

export class Veridion implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Veridion',
		name: 'veridion',
		icon: 'file:veridion.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Match and enrich company data using the Veridion API',
		usableAsTool: true,
		defaults: {
			name: 'Veridion',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'veridionApi',
				required: true,
			},
		],
		properties: [
			// ── Operation selector ──────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Enrich Company',
						value: 'enrichCompany',
						description: 'Match a company and return its enriched Veridion profile',
						action: 'Enrich a company',
					},
					{
						name: 'Company Search',
						value: 'searchCompanies',
						description: 'Discover companies by applying company-oriented search filters',
						action: 'Search for companies',
					},
					{
						name: 'Supplier Search',
						value: 'supplierSearch',
						description: 'Discover suppliers by product, service, and supplier-specific filters',
						action: 'Search for suppliers',
					},
				],
				default: 'enrichCompany',
			},

			// ── Company name (at least one required) ────────────────────────
			{
				displayName: 'Legal Name',
				name: 'legalName',
				type: 'string',
				default: '',
				description: 'Official registered name of the company.',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},
			{
				displayName: 'Commercial Name',
				name: 'commercialName',
				type: 'string',
				default: '',
				description: 'Trading or brand name of the company.',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},

			// ── Locating signals ────────────────────────────────────────────
			{
				displayName: 'Website',
				name: 'website',
				type: 'string',
				default: '',
				placeholder: 'acme.com',
				description: 'Company website domain or URL.',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},
			{
				displayName: 'Address',
				name: 'addressTxt',
				type: 'string',
				default: '',
				placeholder: '123 Main St, Cluj-Napoca, Romania',
				description: 'Free-text address used as a locating signal.',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				default: '',
				placeholder: '+40 123 456 789',
				description: 'Company phone number including country code.',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},

			// ── Registry ID path (combination B: registry_id + address_txt) ─
			{
				displayName: 'Registry ID',
				name: 'registryId',
				type: 'string',
				default: '',
				placeholder: 'RO12345678',
				description: 'Company registry or tax ID.',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},

			// ── Matching tuning ────────────────────────────────────────────
			{
				displayName: 'Minimum Confidence Score',
				name: 'minConfidenceScore',
				type: 'number',
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberStepSize: 0.05,
					numberPrecision: 2,
				},
				default: 0.6,
				description: 'Only return a match if its confidence score meets this threshold (0-1).',
				displayOptions: { show: { operation: ['enrichCompany'] } },
			},

			// ── Search Operations ──────────────────────────────────────────
			{
				displayName: 'Keywords',
				name: 'searchKeywords',
				type: 'string',
				default: '',
				placeholder: 'fleet management, telematics, logistics',
				description: 'Comma-separated keywords to match on company content.',
				displayOptions: { show: { operation: ['searchCompanies'] } },
			},
			{
				displayName: 'Exclude Keywords',
				name: 'searchKeywordsExclude',
				type: 'string',
				default: '',
				placeholder: 'consulting, agency',
				description: 'Comma-separated keywords to exclude.',
				displayOptions: { show: { operation: ['searchCompanies'] } },
			},
			{
				displayName: 'Keywords Strictness',
				name: 'searchKeywordsStrictness',
				type: 'options',
				options: [
					{ name: '1 - Business Tags Only', value: 1 },
					{ name: '2 - Tags + Meta', value: 2 },
					{ name: '3 - Broad', value: 3 },
				],
				default: 3,
				description: 'How broadly to search keyword matches.',
				displayOptions: { show: { operation: ['searchCompanies'] } },
			},
			{
				displayName: 'Product Keywords Group 1',
				name: 'searchProductKeywordGroup1',
				type: 'string',
				default: '',
				placeholder: 'lcd screens, lcd display, lcd panel',
				description: 'First product keyword group. Terms within a group are matched with OR.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Product Keywords Group 2',
				name: 'searchProductKeywordGroup2',
				type: 'string',
				default: '',
				placeholder: 'CE certified, CE certification',
				description: 'Optional second keyword group. Separate groups are matched with AND.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Product Keywords Group 3',
				name: 'searchProductKeywordGroup3',
				type: 'string',
				default: '',
				placeholder: 'OEM, private label',
				description: 'Optional third keyword group. Separate groups are matched with AND.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Product Exclude Keywords',
				name: 'searchProductExcludeKeywords',
				type: 'string',
				default: '',
				placeholder: 'retail',
				description: 'Comma-separated keywords to exclude from product matches.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Supplier Types',
				name: 'searchSupplierTypes',
				type: 'multiOptions',
				options: [
					{ name: 'Manufacturer', value: 'manufacturer' },
					{ name: 'Distributor', value: 'distributor' },
					{ name: 'Service Provider', value: 'service_provider' },
					{ name: 'Software Provider', value: 'software_provider' },
				],
				default: [],
				description: 'Optional supplier types for product search.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Country Code',
				name: 'searchCountry',
				type: 'string',
				default: '',
				placeholder: 'US',
				description: 'ISO 3166-1 alpha-2 country code.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Region / State',
				name: 'searchRegion',
				type: 'string',
				default: '',
				description: 'Optional region or state for the company location filter.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'City',
				name: 'searchCity',
				type: 'string',
				default: '',
				description: 'Optional city for the company location filter.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Location Strictness',
				name: 'searchLocationStrictness',
				type: 'options',
				options: [
					{ name: '1 - Main Location', value: 1 },
					{ name: '2 - Secondary Locations', value: 2 },
					{ name: '3 - Main + Secondary', value: 3 },
				],
				default: 3,
				description: 'Whether to search main locations, secondary locations, or both.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Postcode',
				name: 'searchPostcodes',
				type: 'string',
				default: '',
				placeholder: '94123, 10001',
				description: 'Comma-separated list of postcodes.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Postcode Strictness',
				name: 'searchPostcodeStrictness',
				type: 'options',
				options: [
					{ name: '1 - Main Location', value: 1 },
					{ name: '2 - Secondary Locations', value: 2 },
					{ name: '3 - Main + Secondary', value: 3 },
				],
				default: 3,
				description: 'Whether postcode matching should target main locations, secondary locations, or both.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Industries',
				name: 'searchIndustry',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getIndustries',
				},
				default: [],
				description: 'Select one or more Veridion industries.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'NAICS Codes',
				name: 'searchNaicsCodes',
				type: 'string',
				default: '',
				placeholder: '541512, 511210',
				description: 'Comma-separated NAICS codes. Prefix values are supported.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'NAICS Strictness',
				name: 'searchNaicsStrictness',
				type: 'options',
				options: [
					{ name: '1 - Primary Only', value: 1 },
					{ name: '2 - Secondary Only', value: 2 },
					{ name: '3 - Primary + Secondary', value: 3 },
				],
				default: 3,
				description: 'Whether to search primary NAICS, secondary NAICS, or both.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Employee Count (Min)',
				name: 'searchEmployeeCountMin',
				type: 'string',
				default: '',
				description: 'Minimum employee count.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Employee Count (Max)',
				name: 'searchEmployeeCountMax',
				type: 'string',
				default: '',
				description: 'Maximum employee count.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Estimated Revenue Min USD',
				name: 'searchRevenueMin',
				type: 'string',
				default: '',
				description: 'Minimum estimated annual revenue in USD.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Estimated Revenue Max USD',
				name: 'searchRevenueMax',
				type: 'string',
				default: '',
				description: 'Maximum estimated annual revenue in USD.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Year Founded Min',
				name: 'searchYearFoundedMin',
				type: 'string',
				default: '',
				description: 'Minimum founding year.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Year Founded Max',
				name: 'searchYearFoundedMax',
				type: 'string',
				default: '',
				description: 'Maximum founding year.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Proximity Address',
				name: 'searchProximityAddress',
				type: 'string',
				default: '',
				placeholder: 'Toronto, M5B 2L7, Ontario',
				description: 'Reference address for proximity search.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Proximity Radius',
				name: 'searchProximityRadius',
				type: 'string',
				default: '',
				description: 'Radius for proximity search. Maximum 500 km or 300 mi.',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Proximity Unit',
				name: 'searchProximityUnit',
				type: 'options',
				options: [
					{ name: 'Kilometers', value: 'km' },
					{ name: 'Miles', value: 'mi' },
				],
				default: 'km',
				displayOptions: { show: { operation: ['supplierSearch'] } },
			},
			{
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 200,
					numberPrecision: 0,
				},
				default: 10,
				description: 'Number of results per page. Maximum is 200.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Pagination Token',
				name: 'paginationToken',
				type: 'string',
				default: '',
				description: 'Opaque token from a previous response to fetch the next page.',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
			{
				displayName: 'Output Mode',
				name: 'searchOutputMode',
				type: 'options',
				options: [
					{
						name: 'Company Items',
						value: 'companyItems',
						description: 'Return one n8n item per company and include search metadata on each item',
					},
					{
						name: 'Full Response',
						value: 'fullResponse',
						description: 'Return the raw Veridion response as a single n8n item',
					},
				],
				default: 'companyItems',
				displayOptions: { show: { operation: ['searchCompanies', 'supplierSearch'] } },
			},
		],
	};

	methods = {
		loadOptions: {
			async getIndustries(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await Veridion.loadIndustries(this);

				return response
					.filter((entry) => entry?.type === 'industry' && typeof entry.name === 'string')
					.map((entry) => ({
						name: entry.name as string,
						value: entry.name as string,
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	// ── Execution ──────────────────────────────────────────────────────────

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;

			if (operation === 'enrichCompany') {
				const result = await Veridion.enrichCompany(this, i);
				returnData.push({ json: result });
				continue;
			}

			if (operation === 'searchCompanies') {
				const results = await Veridion.searchCompanies(this, i, operation);
				returnData.push(...results);
				continue;
			}

			if (operation === 'supplierSearch') {
				const results = await Veridion.searchCompanies(this, i, operation);
				returnData.push(...results);
			}
		}

		return [returnData];
	}

	// ── enrichCompany helper ───────────────────────────────────────────────

	private static async enrichCompany(
		ctx: IExecuteFunctions,
		itemIndex: number,
	): Promise<IDataObject> {
		// ── 1. Collect and trim all parameters ────────────────────────────
		const legalName       = (ctx.getNodeParameter('legalName',        itemIndex, '') as string).trim();
		const commercialName  = (ctx.getNodeParameter('commercialName',   itemIndex, '') as string).trim();
		const website         = (ctx.getNodeParameter('website',          itemIndex, '') as string).trim();
		const addressTxt      = (ctx.getNodeParameter('addressTxt',       itemIndex, '') as string).trim();
		const phoneNumber     = (ctx.getNodeParameter('phoneNumber',      itemIndex, '') as string).trim();
		const registryId      = (ctx.getNodeParameter('registryId',       itemIndex, '') as string).trim();
		const minConfidenceScore = ctx.getNodeParameter('minConfidenceScore', itemIndex, 0.6) as number;

		const hasName = !!(legalName || commercialName);
		const hasSignal = !!(website || addressTxt || phoneNumber || registryId);

		// ── 2. Validate input combinations before calling the API ──────────
		if (!hasName) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Provide at least one of Legal Name or Commercial Name.',
				{ itemIndex },
			);
		}
		if (!hasSignal) {
			throw new NodeOperationError(
				ctx.getNode(),
				'A company name alone is not enough. Please also provide at least one of: Address, Website, Registry ID, or Phone Number.',
				{ itemIndex },
			);
		}

		// ── 3. Build request body — omit empty fields ──────────────────────
		const identifiers: VeridionIdentifiers = {};

		if (legalName) identifiers.legal_names = [legalName];
		if (commercialName) identifiers.commercial_names = [commercialName];
		if (website) identifiers.website = website;
		if (addressTxt) identifiers.address_txt = addressTxt;
		if (phoneNumber) identifiers.phone_number = phoneNumber;
		if (registryId) identifiers.registry_id = registryId;

		const body: VeridionMatchBody = { identifiers };

		// ── 4. Call the API and handle response ────────────────────────────
		return Veridion.callWithFullResponse(ctx, body, minConfidenceScore, itemIndex);
	}

	private static async searchCompanies(
		ctx: IExecuteFunctions,
		itemIndex: number,
		operation: string,
	): Promise<INodeExecutionData[]> {
		const pageSize = ctx.getNodeParameter('pageSize', itemIndex, 10) as number;
		const paginationToken = (
			ctx.getNodeParameter('paginationToken', itemIndex, '') as string
		).trim();
		const outputMode = ctx.getNodeParameter(
			'searchOutputMode',
			itemIndex,
			'companyItems',
		) as string;
		const country = (
			ctx.getNodeParameter('searchCountry', itemIndex, '') as string
		).trim();
		const region = (
			ctx.getNodeParameter('searchRegion', itemIndex, '') as string
		).trim();
		const city = (ctx.getNodeParameter('searchCity', itemIndex, '') as string).trim();
		const locationStrictness = ctx.getNodeParameter(
			'searchLocationStrictness',
			itemIndex,
			3,
		) as number;
		const postcodes = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchPostcodes', itemIndex, '') as string,
		);
		const postcodeStrictness = ctx.getNodeParameter(
			'searchPostcodeStrictness',
			itemIndex,
			3,
		) as number;
		const naicsCodes = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchNaicsCodes', itemIndex, '') as string,
		);
		const naicsStrictness = ctx.getNodeParameter(
			'searchNaicsStrictness',
			itemIndex,
			3,
		) as number;
		const industries = Veridion.getStringListParameter(
			ctx.getNodeParameter('searchIndustry', itemIndex, []) as string[] | string,
		);
		const keywords = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchKeywords', itemIndex, '') as string,
		);
		const excludeKeywords = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchKeywordsExclude', itemIndex, '') as string,
		);
		const keywordsStrictness = ctx.getNodeParameter(
			'searchKeywordsStrictness',
			itemIndex,
			3,
		) as number;
		const employeeCountMin = Veridion.getOptionalNumberParameter(
			ctx,
			'searchEmployeeCountMin',
			itemIndex,
		);
		const employeeCountMax = Veridion.getOptionalNumberParameter(
			ctx,
			'searchEmployeeCountMax',
			itemIndex,
		);
		const revenueMin = Veridion.getOptionalNumberParameter(
			ctx,
			'searchRevenueMin',
			itemIndex,
		);
		const revenueMax = Veridion.getOptionalNumberParameter(
			ctx,
			'searchRevenueMax',
			itemIndex,
		);
		const yearFoundedMin = Veridion.getOptionalNumberParameter(
			ctx,
			'searchYearFoundedMin',
			itemIndex,
		);
		const yearFoundedMax = Veridion.getOptionalNumberParameter(
			ctx,
			'searchYearFoundedMax',
			itemIndex,
		);
		const proximityAddress = (
			ctx.getNodeParameter('searchProximityAddress', itemIndex, '') as string
		).trim();
		const proximityRadius = Veridion.getOptionalNumberParameter(
			ctx,
			'searchProximityRadius',
			itemIndex,
		);
		const proximityUnit = ctx.getNodeParameter(
			'searchProximityUnit',
			itemIndex,
			'km',
		) as string;
		const productKeywordGroup1 = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchProductKeywordGroup1', itemIndex, '') as string,
		);
		const productKeywordGroup2 = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchProductKeywordGroup2', itemIndex, '') as string,
		);
		const productKeywordGroup3 = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchProductKeywordGroup3', itemIndex, '') as string,
		);
		const productExcludeKeywords = Veridion.parseCommaSeparated(
			ctx.getNodeParameter('searchProductExcludeKeywords', itemIndex, '') as string,
		);
		const supplierTypes = ctx.getNodeParameter(
			'searchSupplierTypes',
			itemIndex,
			[],
		) as string[];

		if ((region || city) && !country) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Country Code is required when Region / State or City is provided.',
				{ itemIndex },
			);
		}

		if ((proximityAddress && !proximityRadius) || (!proximityAddress && proximityRadius)) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Proximity Address and Proximity Radius must be provided together.',
				{ itemIndex },
			);
		}

		const productKeywordGroups = [
			productKeywordGroup1,
			productKeywordGroup2,
			productKeywordGroup3,
		].filter((group) => group.length > 0);

		if (operation === 'supplierSearch' && productKeywordGroups.length === 0) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Supplier Search requires at least Product Keywords Group 1, 2, or 3.',
				{ itemIndex },
			);
		}

		const filters: IDataObject[] = [];

		if (country) {
			const locationValue: IDataObject = { country };
			if (region) locationValue.region = region;
			if (city) locationValue.city = city;
			filters.push({
				attribute: 'company_location',
				relation: 'in',
				value: [locationValue],
				strictness: locationStrictness,
			});
		}

		if (postcodes.length > 0) {
			filters.push({
				attribute: 'company_postcode',
				relation: postcodes.length === 1 ? 'equals' : 'in',
				value: postcodes.length === 1 ? postcodes[0] : postcodes,
				strictness: postcodeStrictness,
			});
		}

		if (naicsCodes.length > 0) {
			filters.push({
				attribute: 'company_naics_code',
				relation: naicsCodes.length === 1 ? 'equals' : 'in',
				value: naicsCodes.length === 1 ? naicsCodes[0] : naicsCodes,
				strictness: naicsStrictness,
			});
		}

		if (industries.length > 0) {
			filters.push({
				attribute: 'company_industry',
				relation: industries.length === 1 ? 'equals' : 'in',
				value: industries.length === 1 ? industries[0] : industries,
			});
		}

		if (operation === 'searchCompanies' && keywords.length > 0) {
			const keywordValue: IDataObject = {
				match: {
					operator: 'or',
					operands: keywords,
				},
			};

			if (excludeKeywords.length > 0) {
				keywordValue.exclude = {
					operator: 'or',
					operands: excludeKeywords,
				};
			}

			filters.push({
				attribute: 'company_keywords',
				relation: 'match_expression',
				value: keywordValue,
				strictness: keywordsStrictness,
			});
		}

		if (employeeCountMin !== null || employeeCountMax !== null) {
			filters.push(
				Veridion.buildRangeFilter(
					'company_employee_count',
					employeeCountMin,
					employeeCountMax,
				),
			);
		}

		if (revenueMin !== null || revenueMax !== null) {
			filters.push(
				Veridion.buildRangeFilter(
					'company_estimated_revenue',
					revenueMin,
					revenueMax,
				),
			);
		}

		if (yearFoundedMin !== null || yearFoundedMax !== null) {
			filters.push(
				Veridion.buildRangeFilter(
					'company_year_founded',
					yearFoundedMin,
					yearFoundedMax,
				),
			);
		}

		if (proximityAddress && proximityRadius !== null) {
			filters.push({
				attribute: 'company_location',
				relation: 'within',
				value: {
					address: proximityAddress,
					radius: proximityRadius,
					unit: proximityUnit,
				},
				strictness: locationStrictness,
			});
		}

		if (productKeywordGroups.length > 0) {
			const match =
				productKeywordGroups.length === 1
					? {
							operator: 'or',
							operands: productKeywordGroups[0],
						}
					: {
							operator: 'and',
							operands: productKeywordGroups.map((group) => ({
								operator: 'or',
								operands: group,
							})),
						};

			const productValue: IDataObject = {
				match,
			};

			if (productExcludeKeywords.length > 0) {
				productValue.exclude = {
					operator: 'or',
					operands: productExcludeKeywords,
				};
			}

			const productFilter: IDataObject = {
				attribute: 'company_products',
				relation: 'match_expression',
				value: productValue,
			};

			if (supplierTypes.length > 0) {
				productFilter.supplier_types = supplierTypes;
			}

			filters.push(productFilter);
		}

		if (filters.length === 0) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Provide at least one search filter before executing Search Companies.',
				{ itemIndex },
			);
		}

		const body: VeridionSearchBody = {
			filters: {
				and: filters,
			},
		};
		const requestDebug = {
			url: 'https://data.veridion.com/search/v4/companies',
			qs: {
				page_size: pageSize,
				...(paginationToken ? { pagination_token: paginationToken } : {}),
			},
			body,
		};

		interface SearchResponse extends IDataObject {
			pagination?: {
				next?: string;
				previous?: string;
			};
			count?: number;
			result?: IDataObject[];
		}

		const fullResponse = (await Veridion.callApi(ctx, {
			method: 'POST',
			url: requestDebug.url,
			qs: requestDebug.qs,
			body: JSON.stringify(body),
		}, itemIndex, true)) as { statusCode: number; body: unknown };

		if (fullResponse.statusCode === 400) {
			const errBody = fullResponse.body as {
				message?: string;
				error?: string;
				path?: string;
				status?: number;
			};
			const message =
				errBody?.message ??
				errBody?.error ??
				'Bad request: check your search filters';
			throw new NodeApiError(
				ctx.getNode(),
				{ message, statusCode: fullResponse.statusCode } as JsonObject,
				{ message, itemIndex, httpCode: String(fullResponse.statusCode) },
			);
		}

		if (fullResponse.statusCode !== 200) {
			const errBody = fullResponse.body as { message?: string; error?: string };
			const message =
				errBody?.message ??
				errBody?.error ??
				`Unexpected HTTP ${fullResponse.statusCode} from Veridion Search API`;
			throw new NodeApiError(
				ctx.getNode(),
				{ message, statusCode: fullResponse.statusCode } as JsonObject,
				{ message, itemIndex, httpCode: String(fullResponse.statusCode) },
			);
		}

		const response = fullResponse.body as SearchResponse;

		if (outputMode === 'fullResponse') {
			return [{ json: { ...response, _veridion_request: requestDebug } }];
		}

		const results = Array.isArray(response.result) ? response.result : [];
		if (results.length === 0) {
			return [
				{
					json: {
						count: response.count ?? 0,
						pagination: response.pagination ?? {},
						result: [],
						_veridion_request: requestDebug,
					},
				},
			];
		}

		return results.map((company) => ({
			json: {
				...company,
				_veridion_search: {
					count: response.count ?? results.length,
					pagination: response.pagination ?? {},
					request: requestDebug,
				},
			},
		}));
	}

	private static parseCommaSeparated(input: string): string[] {
		return input
			.split(',')
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
	}

	private static async loadIndustries(
		ctx: ILoadOptionsFunctions,
	): Promise<VeridionIndustryEntry[]> {
		const credentials = await ctx.getCredentials<{ apiKey: string }>('veridionApi');
		return (await ctx.helpers.httpRequest({
			method: 'GET',
			url: 'https://data.veridion.com/industries/v0',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': credentials.apiKey,
			},
		})) as VeridionIndustryEntry[];
	}

	private static getStringListParameter(input: string[] | string): string[] {
		if (Array.isArray(input)) {
			return input
				.map((value) => value.trim())
				.filter((value) => value.length > 0);
		}

		return Veridion.parseCommaSeparated(input);
	}

	private static getOptionalNumberParameter(
		ctx: IExecuteFunctions,
		name: string,
		itemIndex: number,
	): number | null {
		const rawValue = (
			ctx.getNodeParameter(name, itemIndex, '') as string | number
		)
			.toString()
			.trim();

		if (rawValue === '') {
			return null;
		}

		const value = Number(rawValue);
		if (!Number.isFinite(value)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`"${name}" must be a valid number.`,
				{ itemIndex },
			);
		}

		return value;
	}

	private static buildRangeFilter(
		attribute: string,
		min: number | null,
		max: number | null,
	): IDataObject {
		if (min !== null && max !== null) {
			if (min === max) {
				return {
					attribute,
					relation: 'equals',
					value: min,
				};
			}

			return {
				attribute,
				relation: 'between',
				value: [min, max],
			};
		}

		if (min !== null) {
			return {
				attribute,
				relation: 'greater_than_or_equal',
				value: min,
			};
		}

		return {
			attribute,
			relation: 'less_than_or_equal',
			value: max,
		};
	}

	/**
	 * Makes the API call with returnFullResponse: true so we can inspect the
	 * HTTP status code alongside the parsed body.
	 */
	private static async callWithFullResponse(
		ctx: IExecuteFunctions,
		body: VeridionMatchBody,
		minConfidenceScore: number,
		itemIndex: number,
	): Promise<IDataObject> {
		const fullResponse = await Veridion.callApi(ctx, {
			method: 'POST',
			url: 'https://data.veridion.com/match/v5/companies',
			qs: { min_confidence_score: minConfidenceScore },
			body: JSON.stringify(body),
		}, itemIndex, true);

		const { statusCode, body: responseBody } = fullResponse;

		// 200 — match found, return enriched profile
		if (statusCode === 200) {
			return responseBody as IDataObject;
		}

		// 202 — accepted but no match meets the confidence threshold
		if (statusCode === 202) {
			return {
				matched: false,
				reason: 'No match found above the requested confidence threshold',
			} as VeridionNoMatchResponse;
		}

		// 400 — bad request; surface the API's error message
		if (statusCode === 400) {
			const errBody = responseBody as { message?: string; error?: string };
			const message =
				errBody?.message ?? errBody?.error ?? 'Bad request: check your input fields';
			throw new NodeApiError(
				ctx.getNode(),
				{ message, statusCode } as JsonObject,
				{ message, itemIndex, httpCode: String(statusCode) },
			);
		}

		// Any other error status
		const genericBody = responseBody as { message?: string };
		const message =
			genericBody?.message ?? `Unexpected HTTP ${statusCode} from Veridion API`;
		throw new NodeApiError(
			ctx.getNode(),
			{ message, statusCode } as JsonObject,
			{ message, itemIndex, httpCode: String(statusCode) },
		);
	}

	private static async callApi(
		ctx: IExecuteFunctions,
		options: {
			method: 'POST';
			url: string;
			qs?: IDataObject;
			body: string;
		},
		itemIndex: number,
		returnFullResponse = false,
	): Promise<IDataObject | { statusCode: number; body: unknown }> {
		const credentials = await ctx.getCredentials('veridionApi');

		try {
			return (await ctx.helpers.httpRequest({
				method: options.method,
				url: options.url,
				qs: options.qs,
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': credentials.apiKey as string,
				},
				body: options.body,
				returnFullResponse,
				ignoreHttpStatusErrors: returnFullResponse,
			} as Parameters<typeof ctx.helpers.httpRequest>[0])) as IDataObject;
		} catch (error) {
			const err = error as Error & {
				response?: {
					statusCode?: number;
					body?: {
						message?: string;
						error?: string;
					};
				};
				statusCode?: number;
				httpCode?: string | number;
			};
			const apiMessage =
				err.response?.body?.message ??
				err.response?.body?.error ??
				err.message;
			const statusCode =
				err.response?.statusCode ??
				err.statusCode ??
				(typeof err.httpCode === 'string' ? Number(err.httpCode) : err.httpCode);
			throw new NodeApiError(
				ctx.getNode(),
				{
					message: apiMessage,
					name: err.name,
					...(statusCode ? { statusCode } : {}),
				} as JsonObject,
				{
					itemIndex,
					message: apiMessage,
					...(statusCode ? { httpCode: String(statusCode) } : {}),
				},
			);
		}
	}
}
