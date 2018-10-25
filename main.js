var jsonfile = require('jsonfile');
var editor = require('editor');
var request = require('request');
var tmp = require('tmp');
var fs = require('fs');
var Sync = require('sync');
var async = require("async");
var _ = require('underscore');
var GitHubApi = require("github");
var flatten = require('flat');
var json2xls = require('json2xls');
var jsonexport = require('jsonexport');

var github = new GitHubApi({
	debug: false,
	protocol: "https",
	host: "api.github.com",
	pathPrefix: "",
	headers: {
		"user-agent": "michaelhudak"
	},
	Promise: require('bluebird'),
	followRedirects: false,
	timeout: 5000
});

let licenseMap = require('./licenseMap.js');

jsonfile.spaces = 4

exportData();


function updateGithubData() {	
	let frameworks = jsonfile.readFileSync('frameworks-1.1.0.json');

	async.eachLimit(frameworks.list, 3, function (framework, callback) {
		console.log('Processing framework ' + framework.name);

		if (_.isNull(framework.references.versionControl.github)) {
			console.log('No Github repository');
			callback();
		} else {
			var ds = framework.references.versionControl.github.full_name.split('/');
			console.log('Requesting data for repository ' + ds[1] + ' from owner ' + ds[0]);
			github.repos.get({
				owner: ds[0],
				repo: ds[1]
			}).then(function (res) {
				framework.references.versionControl.github = res.data;
				console.log('Finished processing framework ' + framework.name);
				callback();
			}).catch(function (err) {
				callback(JSON.stringify(err, 2));
			});
		}
	}, function (err) {
		if (err) {
			console.log('A framework failed to load data');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');

			frameworks.version = "1.1.1";
			jsonfile.writeFileSync('frameworks-1.1.1.json', frameworks);
		}
	});
}


function search() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.8.json');

	var res = _.sortBy(frameworks.list, function (framework) {
		return -framework.score;
	});

	_.each(res, function (framework) {
		console.log(framework.name + ': ' + framework.score);
	});
}

function exportData() {
	let frameworks = jsonfile.readFileSync('frameworks-1.1.1.json');

	let framework_list = [];

	_.each(frameworks.list, function (framework) {
		framework_list.push({
			name: framework.name,
			homepage: framework.references.homepage,
			license: framework.license.licenseId ? framework.license.licenseId : "proprietary",
			license_url: framework.license.licenseId ? "https://spdx.org/licenses/" + framework.license.licenseId + ".html" : "",
			wikipedia_url: framework.references.wikipedia ? "https://en.wikipedia.org/?curid=" + framework.references.wikipedia.pageId : "",
			xUnit: framework.supports.xUnit,
			fixtures: framework.supports.fixtures,
			groupFixtures: framework.supports.groupFixtures,
			generators: framework.supports.generators,
			mocks: framework.supports.mocks,
			exceptions: framework.supports.exceptions,
			macros: framework.supports.macros,
			templates: framework.supports.templates,
			grouping: framework.supports.grouping,
			github_url: framework.references.versionControl.github ? framework.references.versionControl.github.html_url : "",
			github_stars: framework.references.versionControl.github ? framework.references.versionControl.github.watchers_count : 0,
			github_forks: framework.references.versionControl.github ? framework.references.versionControl.github.forks_count : 0,
			github_issues: framework.references.versionControl.github ? framework.references.versionControl.github.open_issues : 0
		});
	});

	var options = {
		rowDelimiter: ';',
		undefinedString: 'No Data'
	};
	jsonexport(framework_list, options, function (err, csv) {
		if (err) return console.log(err);
		fs.writeFileSync('frameworks.csv', csv);
	});
}

function setVCS() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.9.json');

	_.each(frameworks.list, function (framework) {
		framework.versionControlSystem.git = framework.references.versionControl.github || framework.references.versionControl.bitbucket ? true : false;
	});

	frameworks.version = "1.1.0";
	frameworks.createdAt = Date.now();
	jsonfile.writeFileSync('frameworks-1.1.0.json', frameworks);
}

function setHomepage() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.8.json');

	_.each(frameworks.list, function (framework) {
		if (framework.references.homepage == ':github') {
			framework.references.homepage = framework.references.versionControl.github.html_url;
		}

		if (framework.references.homepage == ':sourceforge') {
			framework.references.homepage = framework.references.versionControl.sourceforge.url;
		}

		if (framework.references.homepage == ':codeplex') {
			framework.references.homepage = framework.references.versionControl.codeplex.Url;
		}

		if (framework.references.homepage == ':bitbucket') {
			framework.references.homepage = framework.references.versionControl.bitbucket.links.html.href;
		}
	});

	frameworks.version = "1.0.9";
	frameworks.createdAt = Date.now();
	jsonfile.writeFileSync('frameworks-1.0.9.json', frameworks);
}

function generateScore() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.7.json');

	_.each(frameworks.list, function (framework) {
		// every support item + 1
		let scoreSupport = _.chain(framework.supports)
			.map(function (bool, key) {
				return key ? 1 : 0;
			})
			.reduce(function (memo, num) {
				return memo + num;
			}, 0)
			.value();
		// no homepage = -3
		let scoreHomepage = _.isNull(framework.homepage) ? -3 : 0;
		let scoreWikipedia = _.isNull(framework.references.wikipedia) ? 0 : 2;
		let scoreLicense = framework.license.proprietary ? -3 : 0;

		let scoreVCS = 0;
		if (framework.references.versionControl.github) {
			scoreVCS += 3;
			scoreVCS += Math.round(Math.log(Math.max(1, framework.references.versionControl.github.watchers_count)) + Math.log(Math.max(1, framework.references.versionControl.github.forks)) + Math.log(Math.max(1, framework.references.versionControl.github.subscribers_count)));
		}
		if (framework.references.versionControl.bitbucket) {
			scoreVCS += 2;
		}
		if (framework.references.versionControl.sourceforge) {
			scoreVCS += 1;
		}
		if (framework.references.versionControl.codeplex) {
			scoreVCS += 1;
		}
		if (scoreVCS == 0) {
			scoreVCS = -1;
		}

		let score = scoreSupport + scoreHomepage + scoreWikipedia + scoreLicense + scoreVCS;

		framework.score = score;
	});

	frameworks.version = "1.0.8";
	frameworks.createdAt = Date.now();
	jsonfile.writeFileSync('frameworks-1.0.8.json', frameworks);
}

function readDescriptionFiles() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.6.json');

	async.eachLimit(frameworks.list, 5, function (framework, callback) {
		console.log('Processing framework ' + framework.name);

		let frameworkDescription = jsonfile.readFileSync('tmp/desc-fw-' + framework.id + '.json');

		framework.description = frameworkDescription.description;

		callback();
	}, function (err) {
		if (err) {
			console.log('A framework failed to process');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');

			frameworks.version = "1.0.7";
			frameworks.createdAt = Date.now();
			jsonfile.writeFileSync('frameworks-1.0.7.json', frameworks);
		}
	});
}

function createDescriptionFiles() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.6.json');

	async.eachLimit(frameworks.list, 5, function (framework, callback) {
		console.log('Processing framework ' + framework.name);

		var frameworkDescription = {
			name: framework.name,
			description: framework.description,
			homepage: framework.references.homepage
		};

		if (framework.references.versionControl.sourceforge) {
			frameworkDescription.sourceforgeDescription = framework.references.versionControl.sourceforge.short_description;
		}

		if (framework.references.versionControl.codeplex) {
			frameworkDescription.codeplexDescription = framework.references.versionControl.codeplex.Description;
		}

		if (framework.references.versionControl.bitbucket) {
			frameworkDescription.bitbucketDescription = framework.references.versionControl.bitbucket.description;
		}

		jsonfile.writeFileSync('tmp/desc-fw-' + framework.id + '.json', frameworkDescription);
		callback();
	}, function (err) {
		if (err) {
			console.log('A framework failed to process');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');
		}
	});
}

function getSourceforgeData() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.5.json');

	var res = _.filter(frameworks.list, function (framework) {
		return !_.isNull(framework.references.versionControl.sourceforge);
	});

	console.log('Found ' + res.length + ' sourceforge repositories');

	const regex = /projects\/(\w*)/;

	async.eachLimit(res, 3, function (framework, callback) {
		console.log('Processing framework ' + framework.name);

		var repo = regex.exec(framework.references.versionControl.sourceforge);
		console.log('Requesting data for repository ' + repo[1]);
		request('https://sourceforge.net/rest/p/' + repo[1], function (error, response, body) {
			if (error) {
				callback(error);
			} else {
				var res = JSON.parse(body);
				framework.references.versionControl.sourceforge = res;
				console.log('Finished processing framework ' + framework.name);
				callback();
			}
		});
	}, function (err) {
		if (err) {
			console.log('A framework failed to load data');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');

			frameworks.version = "1.0.6";
			frameworks.createdAt = Date.now();
			jsonfile.writeFileSync('frameworks-1.0.6.json', frameworks);
		}
	});
}

function getBitbucketData() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.4.json');

	var res = _.filter(frameworks.list, function (framework) {
		return !_.isNull(framework.references.versionControl.bitbucket);
	});

	console.log('Found ' + res.length + ' bitbucket repositories');

	async.eachLimit(res, 3, function (framework, callback) {
		console.log('Processing framework ' + framework.name);
		console.log('Requesting data for repository ' + framework.references.versionControl.bitbucket);
		request('https://api.bitbucket.org/2.0/repositories/' + framework.references.versionControl.bitbucket, function (error, response, body) {
			if (error) {
				callback(error);
			} else {
				var res = JSON.parse(body);
				framework.references.versionControl.bitbucket = res;
				console.log('Finished processing framework ' + framework.name);
				callback();
			}
		});
	}, function (err) {
		if (err) {
			console.log('A framework failed to load data');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');

			frameworks.version = "1.0.5";
			frameworks.createdAt = Date.now();
			jsonfile.writeFileSync('frameworks-1.0.5.json', frameworks);
		}
	});
}

function getCodeplexData() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.3.json');

	var res = _.filter(frameworks.list, function (framework) {
		return !_.isNull(framework.references.versionControl.codeplex);
	});

	async.eachLimit(res, 3, function (framework, callback) {
		console.log('Processing framework ' + framework.name);

		const regex = /\/\/(\w*)\.codeplex\.com/g;
		let m;
		var repo;

		while ((m = regex.exec(framework.references.versionControl.codeplex)) !== null) {
			if (m.index === regex.lastIndex) {
				regex.lastIndex++;
			}

			m.forEach((match, groupIndex) => {
				repo = match;
			});
		}

		console.log('Requesting data for repository ' + repo);
		request('https://www.codeplex.com/api/projects/' + repo, function (error, response, body) {
			if (error) {
				callback(error);
			} else {
				var res = JSON.parse(body);
				framework.references.versionControl.codeplex = res;
				console.log('Finished processing framework ' + framework.name);
				callback();
			}
		});
	}, function (err) {
		if (err) {
			console.log('A framework failed to load data');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');

			frameworks.version = "1.0.4";
			frameworks.createdAt = Date.now();
			jsonfile.writeFileSync('frameworks-1.0.4.json', frameworks);
		}
	});
}

function addLicenses() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.2.json');
	let licenses = jsonfile.readFileSync('licenses-1.0.0.json');

	var licensesNew = {
		source: licenses.source,
		createdAt: Date.now(),
		list: []
	}
	_.each(licenses.index, function (value, key) {
		let license = value;
		license.spdxId = key;
		license.id = parseInt(license.id) - 1;
		licensesNew.list.push(license);
	});

	frameworks.version = '1.0.3';
	frameworks.createdAt = Date.now();
	frameworks.licenses = licensesNew;

	jsonfile.writeFileSync('frameworks-1.0.3.json', frameworks);
}

function getGithubData() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.1.json');

	async.eachLimit(frameworks.list, 3, function (framework, callback) {
		console.log('Processing framework ' + framework.name);

		if (_.isNull(framework.references.versionControl.github)) {
			console.log('No Github repository');
			callback();
		} else {
			var ds = framework.references.versionControl.github.split('/');
			console.log('Requesting data for repository ' + ds[1] + ' from owner ' + ds[0]);
			github.repos.get({
				owner: ds[0],
				repo: ds[1]
			}).then(function (res) {
				framework.references.versionControl.github = res.data;
				console.log('Finished processing framework ' + framework.name);
				callback();
			}).catch(function (err) {
				callback(JSON.stringify(err, 2));
			});
		}
	}, function (err) {
		if (err) {
			console.log('A framework failed to load data');
			console.log(err);
		} else {
			console.log('All frameworks have been processed successfully!');

			frameworks.version = "1.0.2";
			jsonfile.writeFileSync('frameworks-1.0.2.json', frameworks);
		}
	});
}

function setWikipediaPageId() {
	let frameworks = jsonfile.readFileSync('frameworks-1.0.0.json');

	for (let framework of frameworks.list) {
		if (framework.references.wikipedia == "na") {
			framework.references.wikipedia = null;
		} else {
			let title = framework.references.wikipedia.substr(framework.references.wikipedia.lastIndexOf('wiki/') + 5);
			let reqUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&titles=' + title;
			let res = request('GET', reqUrl);
			let resObj = JSON.parse(res.getBody('utf8'));
			var pageId = Object.keys(resObj.query.pages)[0];
			framework.references.wikipedia = {
				pageId: pageId,
				title: resObj.query.pages[pageId].title
			}
		}
	}
	frameworks.version = "1.0.1";
	jsonfile.writeFileSync('frameworks-1.0.1.json', frameworks);
}

function createFrameworksFile() {
	let dataSource = jsonfile.readFileSync('utfc.json');

	var idCounter = 0;
	var frameworks = {
		version: "1.0.0",
		createdAt: Date.now(),
		sources: [
			'https://en.wikipedia.org/wiki/List_of_unit_testing_frameworks#C.2B.2B',
			'https://de.wikipedia.org/wiki/Liste_von_Modultest-Software#C.2B.2B',
			'https://www.google.com'
		],
		list: []
	}

	for (let framework of dataSource) {
		let nameId = framework.Name;

		frameworks.list.push({
			id: idCounter++,
			name: framework.Name,
			description: framework.Remarks,
			supports: {
				xUnit: toBoolean(framework['xUnit']),
				fixtures: toBoolean(framework['Fixtures']),
				groupFixtures: toBoolean(framework['Group fixtures']),
				generators: toBoolean(framework['Generators']),
				mocks: toBoolean(framework['Mocks']),
				exceptions: toBoolean(framework['Exceptions']),
				macros: toBoolean(framework['Macros']),
				templates: toBoolean(framework['Templates']),
				grouping: toBoolean(framework['Grouping'])
			},
			references: {
				homepage: framework['Website'],
				versionControl: {
					github: framework['Github'] == 'na' ? null : framework['Github'],
					codeplex: framework['Codeplex'] == 'na' ? null : framework['Codeplex'],
					bitbucket: framework['Bitbucket'] == 'na' ? null : framework['Bitbucket'],
					sourceforge: framework['Sourceforge'] == 'na' ? null : framework['Sourceforge'],
					others: []
				},
				documentation: [],
				download: null,
				tutorials: [],
				version: {
					label: null,
					released: 0,
					source: ""
				},
				changeLog: null,
				forum: null,
				wikipedia: framework['Wikipedia']
			},
			versionControlSystem: {
				git: null,
				svn: null
			},
			license: licenseMap[framework['License']]
		});
	}

	jsonfile.writeFileSync('frameworks-1.0.0.json', frameworks);
}

function toBoolean(arg) {
	return arg == 'Yes' ? true : arg == 'No' ? false : null;
}

function createLicensesFile() {
	let licenses = jsonfile.readFileSync('licenses.json');

	var licenseList = Array();
	var licensesTmp = {};

	for (let license of licenses.licenses) {
		licenseList.push(license.licenseId);

		licensesTmp[license.licenseId] = {
			id: license.referenceNumber,
			name: license.name,
			isDeprecated: license.isDeprecatedLicenseId,
			isOsiApproved: license.isOsiApproved,
			references: {
				json: 'https://spdx.org/licenses/' + license.licenseId + '.json',
				html: 'https://spdx.org/licenses/' + license.licenseId + '.html',
				txt: 'https://spdx.org/licenses/' + license.licenseId + '.txt',
				seeAlso: license.seeAlso
			}
		}
	}

	var result = {
		version: '1.0.0',
		source: {
			version: licenses.frameworkListVersion,
			releasedAt: Date.parse(licenses.releaseDate),
			website: 'https://spdx.org/licenses/'
		},
		createdDate: Date.now(),
		list: licenseList,
		index: licensesTmp
	};

	jsonfile.writeFileSync('licenses-1.0.0.json', result);
}