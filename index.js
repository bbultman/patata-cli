"use strict";

var Liftoff = require('liftoff');
var getPort = require('get-port');
var Q = require('q');
var colors = require('colors');
var argv = require('yargs')
	.usage('$0 -S <suite-name> [optional arguments]')
	.example('$0 -S login\n')
	.example('$0 -S login -c android19 -C components/login -f components/login -p apps/app.apk -r json -s localhost:12345')
	.options(require('./lib/cli.argv'))
	.help()
	.argv

var appiumApp;

var Patata = new Liftoff({
  name: 'patata',
  processTitle: 'patata',
  moduleName: 'patata',
  configName: 'patatafile'
});

Patata.launch({}, function(result) {
    printLogo();

    // Require patatafile
    require(result.configPath);
    let patata = require(result.modulePath);

    const suiteName = argv.suite;

    if (useCommandLineArgs(argv)) {
    	patata.suite(suiteName, buildSuite(argv));
    }

    // Fix default values
    fixDefaultValues(patata, suiteName).then(function(patata) {
        // Current suite
        var currentSuite = patata.getSuite(suiteName);

        // Start appium
        startAppium(currentSuite).then(() => {
            // Init suite
            patata.init(suiteName);

            // Create cucumber args
            var cucumberArgs = createCucumberArgs(patata);

            // Init cucumber with args
            startCucumber(cucumberArgs);
        }).catch(function(error) {
            throw new Error(error);
        });
    }).catch(function(error) {
        throw new Error(error);
    });
});

//
// Fix default suite values that were optional
// on the patata configuration suite from patatafile.js
//
function fixDefaultValues(patata, suiteName) {
    var deferred = Q.defer();

    getPort().then(function(port) {
        // Current suite
        var currentSuite = patata.getSuite(suiteName);

        // Fix features default values
        currentSuite.features = currentSuite.features || {};
        currentSuite.features.files = currentSuite.features.files || [];
        currentSuite.features.tags = currentSuite.features.tags || [];
        currentSuite.features.scenarios = currentSuite.features.scenarios || [];

        // Reports
        currentSuite.reports = currentSuite.reports || [];

        // Fix server default values
        currentSuite.servers =
            currentSuite.servers && currentSuite.servers.length ?
            currentSuite.servers :
            [{ host: 'localhost', port: port }];

        // Replace previous suite with complete values
        patata.suite(suiteName, currentSuite);

        // Return
        deferred.resolve(patata, suiteName);
    });

    return deferred.promise;
}

//
// Start appium based on the patata configuration suite
//
function startAppium(currentSuite) {
    // User first server (TODO: be able to use more servers)
    var server = currentSuite.servers[0];

    // Create appium arguments
    var cmd = 'appium -p ' + server.port + ' -a ' + server.host;

    // Exec appium
    appiumApp = require('child_process').exec(cmd);

    var deferred = Q.defer();
    setTimeout(deferred.resolve, 3000);
    return deferred.promise;
}

function stopAppium() {
    if (appiumApp) {
        appiumApp.exit();
    }
}

//
// Create the neccesary cucumber args based on
// the patata configuration suite.
//
function createCucumberArgs(patata) {
    // Load Patata support files for Cucumber
    var supportDir = process.cwd() + '/node_modules/patata/dist/js/cucumber/support/';

    // Create default arguments for cucumber
    var defaultArgs = ['','', '--require', supportDir];

    var featureFilesArgs =      buildWithArgs('', patata.currentSuite.features.files, '');
    var featureTagArgs =        buildWithArgs('', patata.currentSuite.features.tags, '--tags');
    var featureScenarioArgs =   buildWithArgs('', patata.currentSuite.features.scenarios, '--name');

    var componentsArgs =        buildWithArgs(process.cwd() + '/', patata.currentSuite.components, '--require');
    var implementationArgs =    buildWithArgs(process.cwd() + '/', patata.currentSuite.include, '--require');

    // Build cucumber args
    var args = defaultArgs;
    args = args.concat(featureTagArgs);
    args = args.concat(featureScenarioArgs);
    args = args.concat(componentsArgs);
    args = args.concat(implementationArgs);
    args = args.concat(featureFilesArgs);

    // Print on screen
    printMessage(patata);

    return args;
}

//
// Start cucumber cli based on arguments
//
function startCucumber(args) {
    // Init cucumber
    var Cucumber = require(process.cwd() + '/node_modules/cucumber/lib/cucumber');
    var cucumberCli = Cucumber.Cli(args);
    var cucumberCliAction = function (succeeded) {
        var code = succeeded ? 0 : 1;

        function exitNow() {
            process.exit(code);
        }

        if (process.stdout.write('')) {
            exitNow();
        } else {
            // write() returned false, kernel buffer is not empty yet...
            process.stdout.on('drain', exitNow);
        }
    };

    cucumberCli.run(cucumberCliAction).then(function() {
        stopAppium();
    });
}

function useCommandLineArgs(cliArgs) {
	return (cliArgs.capability && cliArgs.components && cliArgs.features && cliArgs.provider)
}

function resolveFeatures(features) {
	if (!features) return;

	let returnableStructure = {
		files: [],
		tags: [],
		scenarios: []
	};

	features.forEach(item => {
		if (item.substring(0, 1) === '@' || item.substring(0, 1) === '~') {
			// tags
			returnableStructure.tags.push(item);
		} else if (item.indexOf('/') !== -1) {
			// files
			returnableStructure.files.push(item);
		} else {
			// scenarios
			returnableStructure.scenarios.push(item);
		}
	});

	return returnableStructure;
}

function resolveServers(servers) {
	if (!servers) return;

	return servers.map(item => {
		const parts = item.split(':');
		return {
			host: parts[0] || 'localhost',
			port: parts[1]
		};
	});
}

function buildSuite(rawSuite) {
	return {
		capability: rawSuite.capability,
        components: rawSuite.components,
        include: rawSuite.include,
        features: resolveFeatures(rawSuite.features),
        provider: {
            path: rawSuite.provider
        },
        config: {}, // Should be a function call that resolves to a config object.
        servers: resolveServers(rawSuite.servers),
        reports: rawSuite.reports || ['json']
	}
}

//
// Create an cli arguments based on an array and prefix. If not prefix, pass null.
// Eg. (prefix = '--letter') and (anyArray = ['a','b','c'])
//     Result: ['--letter a', '--letter b', '--letter c']
// Useful to create arguments for appium cli
//
function buildWithArgs(prefix, anyArray, argName) {
    var result = [];

    for (var i = 0; i < anyArray.length; i++) {
    	if (argName) {
            result.push(argName);
        }
    	result.push(prefix + anyArray[i]);
    }

    return result;
}

function printMessage(patata) {
    console.log("Tags:".cyan, "\t\t " + patata.currentSuite.features.tags);
    console.log("Scenarios:".cyan, "\t " + patata.currentSuite.features.scenarios);
    console.log("Components:".cyan, "\t " + patata.currentSuite.components);
    console.log("Include:".cyan, "\t " + patata.currentSuite.include);
    console.log("Features:".cyan, "\t " + patata.currentSuite.features.files);
    console.log("Reports:".cyan, "\t " + patata.reports);
    console.log("\n");
}

function printLogo() {
    console.log(        "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0__\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0__\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0__\n".yellow +
        "______\u00A0\u00A0_____\u00A0\u00A0\u00A0_/\u00A0\u00A0|_\u00A0_____\u00A0\u00A0\u00A0_/\u00A0\u00A0|_\u00A0_____\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0|__|\u00A0\u00A0____\n".yellow +
        "\\____\u00A0\\\u00A0\\__\u00A0\u00A0\\\u00A0\u00A0\\\u00A0\u00A0\u00A0__\\\\__\u00A0\u00A0\\\u00A0\u00A0\\\u00A0\u00A0\u00A0__\\\\__\u00A0\u00A0\\\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0|\u00A0\u00A0|\u00A0/\u00A0\u00A0_\u00A0\\\n".yellow +
        "|\u00A0\u00A0|_>\u00A0>\u00A0/\u00A0__\u00A0\\_\u00A0|\u00A0\u00A0|\u00A0\u00A0\u00A0/\u00A0__\u00A0\\_\u00A0|\u00A0\u00A0|\u00A0\u00A0\u00A0/\u00A0__\u00A0\\_\u00A0\u00A0\u00A0\u00A0|\u00A0\u00A0|(\u00A0\u00A0<_>\u00A0)\n".yellow +
        "|\u00A0\u00A0\u00A0__/\u00A0(____\u00A0\u00A0/\u00A0|__|\u00A0\u00A0(____\u00A0\u00A0/\u00A0|__|\u00A0\u00A0(____\u00A0\u00A0/\u00A0/\\\u00A0|__|\u00A0\\____/\n".yellow +
        "|__|\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\\/\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\\/\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\\/\u00A0\u00A0\\/\n".yellow
    );
}
