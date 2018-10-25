var jsonfile = require('jsonfile');
var _ = require('underscore');
var fs = require('fs');

let exportLicensesData = "<?php\n\n// *** AUTO-GENERATED FILE ***\n\n$licenses = array();\n";
let licenses = jsonfile.readFileSync('licenses-1.0.0.json');
_.each(licenses.index, function(license, licenseId) {
	exportLicensesData += "$licenses[] = array(\n";
	exportLicensesData += "\t\"token\" => \"" + licenseId + "\",\n";
	exportLicensesData += "\t\"name\" => \"" + license.name.replace(/\"/g, "\\\"") + "\",\n";
	exportLicensesData += "\t\"isDeprecated\" => " + license.isDeprecated + ",\n";
	exportLicensesData += "\t\"isOsiApproved\" => " + license.isOsiApproved + "\n";
	exportLicensesData += ");\n";
});
exportLicensesData += "\n?>\n";

fs.writeFileSync('licenses.php', exportLicensesData);
