﻿'use strict';
var NodeCache = require("node-cache");
var apiCache = new NodeCache();

module.exports = function ldapClient(context) {

    var ldap = require('ldapjs');
    var client = ldap.createClient({
        url: 'ldap://ldap.epfl.ch',
        timeLimit: 1,
        sizeLimit: 10
    });

    function cacheQuery(ldapQuery, objectFactory, modelMapper, isResultUniq, next) {
        var groupedObject = {};
        var opts = {
            filter: ldapQuery,
            scope: 'sub'
        };
        
        client.search(context.options.searchBase, opts, function (err, ldapRes) {
            ldapRes.on('searchEntry', function (entry) {
                if (typeof entry.json != 'undefined') {
                    var objectIdentifier = entry.object.uniqueIdentifier;
                    if (groupedObject[objectIdentifier] === undefined) {
                        groupedObject[objectIdentifier] = Array();
                    }
                    groupedObject[objectIdentifier].push(entry.object);
                } else {
                    next(groupedObject);
                }
            });
            ldapRes.on('searchReference', function (referral) {
                //console.log('referral: ' + referral.uris.join());
            });
            ldapRes.on('error', function (err) {
                console.error('error: ' + err.message);
                next(groupedObject);
            });
            ldapRes.on('timeout', function (err) {
                console.error('error: ' + err.message);
            });
            ldapRes.on('end', function () {
                var objectsGroup = Array();
                
                for (var userEntry in groupedObject) {
                    if (groupedObject.hasOwnProperty(userEntry)) {
                        if (isResultUniq) {
                            objectsGroup = groupedObject[userEntry];
                        } else {
                            objectsGroup.push(groupedObject[userEntry]);
                        }
                    }
                }
                next(objectsGroup);
            });
        });
    }

    client.executeQuery = function(ldapQuery, objectFactory, modelMapper, isResultUniq, next) {  
        apiCache.get(ldapQuery, function (err, data) {
            if (!err) {
                if (data == undefined) {
                    cacheQuery(ldapQuery, objectFactory, modelMapper, isResultUniq, function(data) {
                        apiCache.set(ldapQuery, data, function (err, success) {
                            if (!err && success) {
                                if (data[0] instanceof Array) {
                                    next(data.map(function(obj) {
                                        return modelMapper(objectFactory(obj));
                                    }));
                                } else {
                                    next(modelMapper(objectFactory(data)));
                                }
                            } else {
                                next({ Error: "aararrggghhh!" });
                            }
                        });
                    });
                } else {
                    next(modelMapper(objectFactory(data)));
                }
            } else {
                next({ Error: "aararrggghhh!" });
            }
        });
    };

    return client;
};