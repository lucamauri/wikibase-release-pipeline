'use strict';

const Util = require( 'wdio-mediawiki/Util' );
const assert = require( 'assert' );
const QueryServiceUI = require( '../../helpers/pages/queryservice-ui/queryservice-ui.page' );
const SuiteLoginPage = require( '../../helpers/pages/SuiteLoginPage' );
const querystring = require( 'querystring' );
const WikibaseApi = require( '../../helpers/WDIOWikibaseApiPatch' );

describe( 'QueryService', () => {
	it( 'Should not be able to post to sparql endpoint', async () => {
		const result = await browser.makeRequest(
			process.env.WDQS_PROXY_SERVER + '/bigdata/namespace/wdq/sparql',
			{ validateStatus: false },
			{}
		);
		assert.strictEqual( result.status, 405 );
	} );

	it( 'Should be able to get sparql endpoint', async () => {
		const result = await browser.makeRequest(
			process.env.WDQS_PROXY_SERVER + '/bigdata/namespace/wdq/sparql'
		);
		assert.strictEqual( result.status, 200 );
	} );

	it( 'Should not be possible to reach blazegraph ldf api thats not enabled', async () => {
		const result = await browser.makeRequest(
			process.env.WDQS_PROXY_SERVER + '/bigdata/namespace/wdq/ldf',
			{ validateStatus: false }
		);
		assert.strictEqual( result.status, 404 );
	} );

	it( 'Should not be possible to reach blazegraph ldf assets thats not enabled', async () => {
		const result = await browser.makeRequest(
			process.env.WDQS_PROXY_SERVER + '/bigdata/namespace/wdq/assets',
			{ validateStatus: false }
		);
		assert.strictEqual( result.status, 404 );
	} );

	it( 'Should not be possible to reach blazegraph workbench', async () => {
		const result = await browser.makeRequest(
			process.env.WDQS_PROXY_SERVER + '/bigdata/#query',
			{ validateStatus: false }
		);
		assert.strictEqual( result.status, 404 );
	} );

	it( 'Should show up with property in queryservice ui after creation', async () => {
		const itemLabel = 'T267743-';
		const propertyValue = 'PropertyExampleStringValue';

		const propertyId = await WikibaseApi.createProperty( 'string' );
		const data = {
			claims: [
				{
					mainsnak: {
						snaktype: 'value',
						property: propertyId,
						datavalue: { value: propertyValue, type: 'string' }
					},
					type: 'statement',
					rank: 'normal'
				}
			]
		};

		const itemId = await WikibaseApi.createItem(
			Util.getTestString( itemLabel ),
			data
		);

		// query the item using wd: prefix
		await QueryServiceUI.open( 'SELECT * WHERE{ wd:' + itemId + ' ?p ?o }' );

		// wait for WDQS-updater
		await browser.pause( 20 * 1000 );

		await QueryServiceUI.submit();
		await ( await QueryServiceUI.resultTable ).waitForDisplayed();

		assert( await QueryServiceUI.resultIncludes( 'schema:version' ) );
		assert( await QueryServiceUI.resultIncludes( 'schema:dateModified' ) );
		assert( await QueryServiceUI.resultIncludes( 'wikibase:timestamp' ) );

		// label should match on the prefix
		assert( await QueryServiceUI.resultIncludes( 'rdfs:label', itemLabel ) );

		// should have one statement
		assert( await QueryServiceUI.resultIncludes( 'wikibase:statements', '1' ) );

		assert( await QueryServiceUI.resultIncludes( 'wikibase:sitelinks', '0' ) );
		assert( await QueryServiceUI.resultIncludes( 'wikibase:identifiers', '0' ) );

		// property value is set with correct rdf
		assert(
			await QueryServiceUI.resultIncludes(
				'<' + process.env.MW_SERVER + '/prop/direct/' + propertyId + '>',
				propertyValue
			)
		);

		// query the property using wdt: prefix
		await QueryServiceUI.open( 'SELECT * WHERE{ ?s wdt:' + propertyId + ' ?o }' );

		await QueryServiceUI.submit();
		await ( await QueryServiceUI.resultTable ).waitForDisplayed();

		// should be set only to the item
		assert(
			await QueryServiceUI.resultIncludes(
				'<' + process.env.MW_SERVER + '/entity/' + itemId + '>',
				propertyValue
			)
		);
	} );

	it( 'Should not show up in queryservice ui after deletion', async () => {
		// TODO make an item using the UI
		const itemId = await WikibaseApi.createItem( Util.getTestString( 'T267743-' ) );

		await SuiteLoginPage.loginAdmin();

		// goto delete page
		const query = { action: 'delete', title: 'Item:' + itemId };
		await browser.url(
			browser.options.baseUrl + '/index.php?' + querystring.stringify( query )
		);
		const destructiveButtonEl = await $(
			'.oo-ui-flaggedElement-destructive button'
		);
		await destructiveButtonEl.waitForDisplayed();
		await destructiveButtonEl.click();

		await QueryServiceUI.open( 'SELECT * WHERE{ wd:' + itemId + ' ?p ?o }' );

		// wait for WDQS-updater
		await browser.pause( 20 * 1000 );

		await QueryServiceUI.submit();

		const resultTable = await QueryServiceUI.resultTable;
		await resultTable.waitForDisplayed();
		const resultText = await resultTable.getText();

		// item should not be included
		assert( !resultText.includes( 'schema:version' ) );
		assert( !resultText.includes( 'schema:dateModified' ) );
		assert( !resultText.includes( 'wikibase:sitelinks' ) );
		assert( !resultText.includes( 'wikibase:identifiers' ) );
		assert( !resultText.includes( 'rdfs:label' ) );

		// timestamp always shows
		assert( resultText.includes( 'wikibase:timestamp' ) );
	} );
} );