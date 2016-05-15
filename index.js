"use strict";

var Liftoff = require('liftoff');
var getPort = require('get-port');
var Q = require('q');
var colors = require('colors');
var argv = require('yargs')
	.usage('$0 -s <suite-name> [optional arguments]')
	.example('$0 -s login\n')
	.example('$0 -s login -c android19 -C components/login -f components/login -p apps/app.apk')
	.options({
		suite: {
			alias: 's',
			demand: true,
			describe: 'Suite to run, lives in your patatafile',
			group: 'Obligatory:'
		},
		capability: {
			alias: 'c',
			demand: false,
			describe: 'Platform version: "android19" or "ios81"',
			group: 'Optional arguments:'
		},
		components: {
			alias: 'C',
			array: true,
			demand: false,
			describe: 'Path to definitions of elements inside the test app',
			group: 'Optional arguments:'
		},
		features: {
			alias: 'f',
			array: true,
			demand: false,
			describe: 'Cucumber tags, paths to files or scenario names',
			group: 'Optional arguments:'
		},
		provider: {
			alias: 'p',
			demand: false,
			describe: 'Relative path to the app binary',
			group: 'Optional arguments:'
		},
		include: {
			alias: 'i',
			array: true,
			demand: false,
			describe: 'Arbitrary modules you want to require',
			group: 'Optional arguments:'
		},
		servers: {
			alias: 'srv',
			array: true,
			demand: false,
			describe: 'Hostname:port of the appium instance you wish to use',
			group: 'Optional arguments:'			
		}
	})
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
    var patata = require(result.modulePath);

    const suiteName = argv.suite;
    
    console.log('CLI SUITE:', suiteFromCLI(argv))

    if (useCommandLineArgs(argv)) {
    	console.log('should use cmd args')

    	// patata.suite(suiteName, suiteFromCLI(argv))
    }

    // Fix default values
    fixDefaultValues(patata, suiteName).then(function(patata) {
        // Current suite
        var currentSuite = patata.getSuite(suiteName);

        console.log('FILE SUITE:', currentSuite)

        // Start appium
        startAppium(currentSuite).then(() => {
            // Init suite
            patata.init(suiteName);
            
            // Create cucumber args
            var cucumberArgs = createCucumberArgs(patata);
        
            // Init cucumber with args
            startCucumber(cucumberArgs);
        });
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
	
	let returnableFeatures = {
		files: [],
		tags: [],
		scenarios: []
	};

	features.forEach(item => {
		if (item.substring(0, 1) === '@' || item.substring(0, 1) === '~') {
			// tags
			returnableFeatures.tags.push(item);
		} else if (item.indexOf('/') !== -1) {
			// files
			returnableFeatures.files.push(item);
		} else {
			// scenarios
			returnableFeatures.scenarios.push(item);
		}
	});

	return returnableFeatures;
}

function resolveServers(servers) {
	if (!servers) return;
	let returnableServers = []


}

function suiteFromCLI(cliArgs) {
	return {
		capability: cliArgs.capability,
        components: cliArgs.components,
        include: cliArgs.include,
        features: resolveFeatures(cliArgs.features),
        provider: {
            path: cliArgs.provider
        },
        config: {}, // Should be a function call that resolves to a config object.
        servers: resolveServers(cliArgs.servers)
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
    console.log("\n");
}

function printLogo() {    
    console.log(
        "                  __             __                __\n".yellow +
        "______  _____   _/  |_ _____   _/  |_ _____       |__|  ____\n".yellow +
        "\\____ \\ \\__  \\  \\   __\\\\__  \\  \\   __\\\\__  \\      |  | /  _ \\\n".yellow +
        "|  |_> > / __ \\_ |  |   / __ \\_ |  |   / __ \\_    |  |(  <_> )\n".yellow +
        "|   __/ (____  / |__|  (____  / |__|  (____  / /\\ |__| \\____/\n".yellow +
        "|__|         \\/             \\/             \\/  \\/\n".yellow
    );                                     
}