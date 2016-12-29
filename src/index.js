'use strict';

const Alexa = require('alexa-sdk');
var APP_ID = undefined; // TODO replace with your app ID (OPTIONAL).

const AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })

const shuffle = require('shuffle-array');

const QuizletAPI = require('quizlet-api').QuizletAPI;
var quizlet;

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    alexa.resources = languageStrings;
    alexa.registerHandlers(entryPointHandlers,
        mainMenuHandlers,
        confirmNavItemHandlers,
        selectNavItemFromListHandlers,
        setMenuHandlers,
        reviewMenuHandlers,
        reviewingHandlers,
        quizMenuHandlers,
        termsQuizHandlers,
        definitionsQuizHandlers);
    alexa.execute();
};

const states = {
    MAINMENU: '_MAINMENU',
    CONFIRMNAVITEM: '_CONFIRMNAVITEM',
    SELECTNAVITEMFROMLIST: '_SELECTNAVITEMFROMLIST',
    SETMENU: '_SETMENU',
    REVIEWMENU: '_REVIEWMENU',
    REVIEWING: '_REVIEWING',
    QUIZMENU: '_QUIZMENU',
    TERMSQUIZ: '_TERMSQUIZ',
    DEFINITIONSQUIZ: '_DEFINITIONSQUIZ'
};

const dataType = {
    SET: 0,
    LAST_SET: 1,
    FAVORITE_SET: 2,
    CLASS_SET: 3,
    CLASS: 4
};

const ITEMS_PER_PAGE = 4;
const ITEMS_PER_QUIZ = 10;
const GOOD_PERCENTAGE = 0.70;
const MAX_SETS = 40;
const MAX_CLASSES = 100;
const MAX_TERMS_PER_SET = 100;

function StoreSetId(userId, id) {
    return new Promise(
        function (resolve, reject) {
            dynamodb.putItem({
                TableName: 'QuizlexaUserData',
                Item: {
                    CustomerId: { S: userId },
                    Data: { S: id.toString() }
                }
            }, function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        }
    )
};

function LoadSetId(userId) {
    return new Promise(
        function (resolve, reject) {
            dynamodb.getItem({
                TableName: 'QuizlexaUserData',
                Key: {
                    CustomerId: { S: userId }
                }
            }, function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        }
    )
};

var entryPointHandlers = {
    'LaunchRequest': function () {
        var accessToken = this.event.session.user.accessToken;
        if (!accessToken) {
            var speechOutput = this.t("LINK_ACCOUNT");
            this.emit(':tellWithLinkAccountCard', speechOutput);
        } else {
            var token = parseToken(accessToken);
            quizlet = new QuizletAPI(token.user_id, token.access_token);
            console.log("username: " + token.user_id + " token: " + token.access_token);
            LoadSetId(this.event.session.user.userId)
                .then((data) => {
                    if ((data.Item !== undefined) && (data.Item.Data !== undefined)) {
                        this.handler.state = '';
                        this.emitWithState('QueryLastSet', data.Item.Data.S);
                    } else {
                        var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
                        this.handler.state = states.MAINMENU;
                        this.emitWithState('MainMenu', speechOutput);
                    }
                })
                .catch((err) => {
                    console.error('error retrieving previous set: ' + err);
                    this.emit(':tell', this.t("UNEXPECTED"));
                });
        }
    },
    'Unhandled': function () {
        // Why is this being called all the time from the alexa-sdk??
        // this.handler.state = '';
        // this.emitWithState('LaunchRequest');
    },
    'QueryLastSet': function (set_id) {
        quizlet.getSafeSet(set_id)
            .then((data) => {
                if (data.http_code) {
                    var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    var set = {};
                    set.id = data.id;
                    set.title = data.title;
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.LAST_SET;
                    this.attributes['quizlet'].data = new Array(set);
                    this.attributes['quizlet'].index = 0;
                    var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption', speechOutput);
                }
            })
            .catch((err) => {
                console.error('error getting set: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    }
};

var mainMenuHandlers = Alexa.CreateStateHandler(states.MAINMENU, {
    'MainMenu': function (prefix) {
        this.attributes['quizlet'] = undefined;
        var speechOutput = (prefix || "") + this.t("MAIN_MENU") + this.t("HOW_CAN_I_HELP");
        var repromptSpeech = this.t("MAIN_MENU_REPROMPT");
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'SelectFavoriteSetIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('QueryUserFavorites');
    },
    'SelectSetIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('QueryUserSets');
    },
    'SelectClassIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('QueryUserClasses');
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('MainMenu');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('MainMenu');
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE_MAIN_MENU", this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, speechOutput);
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'QueryUserSets': function () {
        quizlet.getUserSetsBasic()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_SETS");
                    this.emit(':tell', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.SET;
                    if (data.length > MAX_SETS) {
                        this.attributes['quizlet'].data = data.slice(0, MAX_SETS);
                    } else {
                        this.attributes['quizlet'].data = data;
                    }
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting sets: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'QueryUserFavorites': function () {
        quizlet.getUserFavoritesBasic()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_FAVORITE_SETS");
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.FAVORITE_SET;
                    if (data.length > MAX_SETS) {
                        this.attributes['quizlet'].data = data.slice(0, MAX_SETS);
                    } else {
                        this.attributes['quizlet'].data = data;
                    }
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting favorite sets: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'QueryUserClasses': function () {
        quizlet.getUserClassesBasic()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_CLASSES");
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.CLASS;
                    if (data.length > MAX_CLASSES) {
                        this.attributes['quizlet'].data = data.slice(0, MAX_CLASSES);
                    } else {
                        this.attributes['quizlet'].data = data;
                    }
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting classes: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'QueryClassSets': function () {
        var class_id = this.attributes['quizlet'].class_id;
        quizlet.getClassSetsBasic(class_id)
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_CLASS_SETS");
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.CLASS_SET;
                    if (data.length > MAX_SETS) {
                        this.attributes['quizlet'].data = data.slice(0, MAX_SETS);
                    } else {
                        this.attributes['quizlet'].data = data;
                    }
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting class sets: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'SelectOption': function (prefix) {
        var length = this.attributes['quizlet'].data.length;
        if (length == 1) {
            this.handler.state = states.CONFIRMNAVITEM;
            this.emitWithState('ConfirmNavItem', prefix);
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('SelectNavItemFromList');
        }
    }
});

var confirmNavItemHandlers = Alexa.CreateStateHandler(states.CONFIRMNAVITEM, {
    'ConfirmNavItem': function (prefix) {
        var type = this.attributes['quizlet'].type;
        switch (type) {
            case dataType.SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = this.t("ONE_SET") + this.t("SET_NAME_IS", title) + this.t("USE_SET");
                var repromptSpeech = this.t("USE_SET_REPROMPT");
                this.attributes["reprompt"] = repromptSpeech;
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.LAST_SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = (prefix || "") + this.t("LAST_SET", title) + this.t("USE_SET");
                var repromptSpeech = this.t("USE_SET_REPROMPT");
                this.attributes["reprompt"] = repromptSpeech;
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.FAVORITE_SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = this.t("ONE_FAVORITE_SET") + this.t("SET_NAME_IS", title) + this.t("USE_SET");
                var repromptSpeech = this.t("USE_SET_REPROMPT");
                this.attributes["reprompt"] = repromptSpeech;
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.CLASS_SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = this.t("ONE_CLASS_SET") + this.t("SET_NAME_IS", title) + this.t("USE_SET");
                var repromptSpeech = this.t("USE_SET_REPROMPT");
                this.attributes["reprompt"] = repromptSpeech;
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.CLASS:
                var name = this.attributes['quizlet'].data[this.attributes['quizlet'].index].name;
                var speechOutput = this.t("ONE_CLASS") + this.t("CLASS_NAME_IS", name) + this.t("USE_CLASS");
                var repromptSpeech = this.t("USE_CLASS_REPROMPT");
                this.attributes["reprompt"] = repromptSpeech;
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            default:
                this.emit(':tell', this.t("UNEXPECTED"));
                break;
        }
    },
    'AMAZON.YesIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            var class_id = this.attributes['quizlet'].data[this.attributes['quizlet'].index].id;
            this.attributes["quizlet"].class_id = class_id;
            this.handler.state = states.MAINMENU;
            this.emitWithState('QueryClassSets');
        } else {
            this.handler.state = states.SETMENU;
            this.emitWithState('SelectSet');
        }
    },
    'AMAZON.NoIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('MainMenu');
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.CONFIRMNAVITEM;
        this.emitWithState('ConfirmNavItem');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('MainMenu');
    },
    'AMAZON.HelpIntent': function () {
        var type = this.attributes['quizlet'].type;
        var speechOutput;
        if (type == dataType.CLASS) {
            speechOutput = this.t("HELP_MESSAGE_USE_CLASS", this.t("HOW_CAN_I_HELP"));
        } else {
            speechOutput = this.t("HELP_MESSAGE_USE_SET", this.t("HOW_CAN_I_HELP"));
        }
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var selectNavItemFromListHandlers = Alexa.CreateStateHandler(states.SELECTNAVITEMFROMLIST, {
    'SelectNavItemFromList': function () {
        var data = this.attributes['quizlet'].data;
        var index = this.attributes['quizlet'].index;
        var type = this.attributes['quizlet'].type;

        var paginate = false;
        if (data.length - index > ITEMS_PER_PAGE) {
            paginate = true;
        }

        var speechOutput;
        var repromptSpeech;

        var data_type;

        if (type == dataType.CLASS) {
            data_type = this.t("CLASS");
            speechOutput = this.t("CHOOSE_CLASS") + "<break time=\"1s\"/>";
            var next = "";
            if (paginate == true) {
                next = this.t("SAY_NEXT_MORE_CLASSES")
            }
            repromptSpeech = this.t("CHOOSE_CLASS_REPROMPT", next);
        } else {
            speechOutput = this.t("CHOOSE_SET") + "<break time=\"1s\"/>";
            data_type = this.t("SET");
            var next = "";
            if (paginate == true) {
                next = this.t("SAY_NEXT_MORE_SETS")
            }
            repromptSpeech = this.t("CHOOSE_SET_REPROMPT", next);
        }

        for (var i = 0; i < Math.min(ITEMS_PER_PAGE, data.length - index); i++) {
            var option;
            if (type == dataType.CLASS) {
                option = data[i + index].name;
            } else {
                option = data[i + index].title;
            }
            speechOutput += data_type + "<say-as interpret-as=\"cardinal\">" + (i + 1) + "</say-as>. " + option + "<break time=\"1s\"/>";
        }

        if (paginate == true) {
            if (type == dataType.CLASS) {
                speechOutput += this.t("SAY_NEXT_MORE_CLASSES");
            } else {
                speechOutput += this.t("SAY_NEXT_MORE_SETS");
            }
        }
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'SetOneIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('OneIntent');
        }
    },
    'SetTwoIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('TwoIntent');
        }
    },
    'SetThreeIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('ThreeIntent');
        }
    },
    'SetFourIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('FourIntent');
        }
    },
    'ClassOneIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('OneIntent');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        }
    },
    'ClassTwoIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('TwoIntent');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        }
    },
    'ClassThreeIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('ThreeIntent');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        }
    },
    'ClassFourIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('FourIntent');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        }
    },
    'OneIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            var class_id = this.attributes['quizlet'].data[this.attributes['quizlet'].index].id;
            this.attributes["quizlet"].class_id = class_id;
            this.handler.state = states.MAINMENU;
            this.emitWithState('QueryClassSets');
        } else {
            this.handler.state = states.SETMENU;
            this.emitWithState('SelectSet');
        }
    },
    'TwoIntent': function () {
        var length = this.attributes['quizlet'].data.length;
        var index = this.attributes['quizlet'].index;
        if (length - index < 2) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.attributes['quizlet'].index += 1;
            var type = this.attributes['quizlet'].type;
            if (type == dataType.CLASS) {
                var class_id = this.attributes['quizlet'].data[this.attributes['quizlet'].index].id;
                this.attributes["quizlet"].class_id = class_id;
                this.handler.state = states.MAINMENU;
                this.emitWithState('QueryClassSets');
            } else {
                this.handler.state = states.SETMENU;
                this.emitWithState('SelectSet');
            }
        }
    },
    'ThreeIntent': function () {
        var length = this.attributes['quizlet'].data.length;
        var index = this.attributes['quizlet'].index;
        if (length - index < 3) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.attributes['quizlet'].index += 2;
            var type = this.attributes['quizlet'].type;
            if (type == dataType.CLASS) {
                var class_id = this.attributes['quizlet'].data[this.attributes['quizlet'].index].id;
                this.attributes["quizlet"].class_id = class_id;
                this.handler.state = states.MAINMENU;
                this.emitWithState('QueryClassSets');
            } else {
                this.handler.state = states.SETMENU;
                this.emitWithState('SelectSet');
            }
        }
    },
    'FourIntent': function () {
        var length = this.attributes['quizlet'].data.length;
        var index = this.attributes['quizlet'].index;
        if (length - index < 4) {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        } else {
            this.attributes['quizlet'].index += 3;
            var type = this.attributes['quizlet'].type;
            if (type == dataType.CLASS) {
                var class_id = this.attributes['quizlet'].data[this.attributes['quizlet'].index].id;
                this.attributes["quizlet"].class_id = class_id;
                this.handler.state = states.MAINMENU;
                this.emitWithState('QueryClassSets');
            } else {
                this.handler.state = states.SETMENU;
                this.emitWithState('SelectSet');
            }
        }
    },
    'AMAZON.NextIntent': function () {
        var length = this.attributes['quizlet'].data.length;
        var index = this.attributes['quizlet'].index;
        if (length - index > ITEMS_PER_PAGE) {
            this.attributes['quizlet'].index += ITEMS_PER_PAGE;
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('SelectNavItemFromList');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('Unhandled');
        }
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.SELECTNAVITEMFROMLIST;
        this.emitWithState('SelectNavItemFromList');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('MainMenu');
    },
    'AMAZON.HelpIntent': function () {
        var data = this.attributes['quizlet'].data;
        var index = this.attributes['quizlet'].index;
        var type = this.attributes['quizlet'].type;

        var paginate = false;
        if (data.length - index > ITEMS_PER_PAGE) {
            paginate = true;
        }

        var next = "";
        if (paginate == true) {
            if (type == dataType.CLASS) {
                next += this.t("SAY_NEXT_MORE_CLASSES");
            } else {
                next += this.t("SAY_NEXT_MORE_SETS");
            }
        }

        if (type == dataType.CLASS) {
            var speechOutput = this.t("HELP_MESSAGE_CHOOSE_CLASS", next, this.t("HOW_CAN_I_HELP"));
            this.emit(':ask', speechOutput, this.t("HELP_ME"));
        } else {
            var speechOutput = this.t("HELP_MESSAGE_CHOOSE_SET", next, this.t("HOW_CAN_I_HELP"));
            this.emit(':ask', speechOutput, this.t("HELP_ME"));
        }
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var setMenuHandlers = Alexa.CreateStateHandler(states.SETMENU, {
    'SelectSet': function () {
        var id = this.attributes['quizlet'].data[this.attributes['quizlet'].index].id;
        quizlet.getSafeSet(id)
            .then((data) => {
                if (data.terms.length > MAX_TERMS_PER_SET) {
                    data.terms = data.terms.slice(0, MAX_TERMS_PER_SET);
                }
                this.attributes['quizlet'] = {};
                this.attributes['quizlet'].set = data;
                var id = this.attributes['quizlet'].set.id;
                StoreSetId(this.event.session.user.userId, id)
                    .then((data) => {
                        this.handler.state = states.SETMENU;
                        this.emitWithState('CheckIsFavorite');
                    })
                    .catch((err) => {
                        console.error('error storing previous set: ' + err);
                        this.emit(':tell', this.t("UNEXPECTED"));
                    });
            })
            .catch((err) => {
                console.error('error getting user set ' + id + ':' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'CheckIsFavorite': function () {
        var id = this.attributes['quizlet'].set.id;
        quizlet.getUserFavoritesBasic()
            .then((data) => {
                this.attributes['quizlet'].favorite = false;
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id == id) {
                        this.attributes['quizlet'].favorite = true;
                        break;
                    }
                }
                this.handler.state = states.SETMENU;
                this.emitWithState('ReturnSetInfo');
            })
            .catch((err) => {
                console.error('error getting favorite sets: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'ReturnSetInfo': function () {
        var set = this.attributes['quizlet'].set;
        var speechOutput = this.t("CHOSEN_SET", set.title) + this.t("SET_HAS_X_TERMS", set.terms.length);
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu', speechOutput);
    },
    'SetMenu': function (prefix) {
        var set = this.attributes['quizlet'].set;
        var favoriteState;
        if (this.attributes['quizlet'].favorite == true) {
            favoriteState = this.t("UNMARK_FAVORITE");
        } else {
            favoriteState = this.t("MARK_FAVORITE");
        }
        var speechOutput = (prefix || "") + this.t("SET_MENU", favoriteState);
        var repromptSpeech = this.t("SET_MENU_REPROMPT", favoriteState);
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'ReviewIntent': function () {
        this.handler.state = states.REVIEWMENU;
        this.emitWithState('ReviewMenu');
    },
    'QuizMeIntent': function () {
        this.handler.state = states.QUIZMENU;
        this.emitWithState('QuizMenu');
    },
    'SelectFavoriteSetIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('ToggleFavoriteIntent');
    },
    'ToggleFavoriteIntent': function () {
        if (this.attributes['quizlet'].favorite == true) {
            this.handler.state = states.SETMENU;
            this.emitWithState('UnMarkUserSetFavorite');
        } else {
            this.handler.state = states.SETMENU;
            this.emitWithState('MarkUserSetFavorite');
        }
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('MainMenu');
    },
    'AMAZON.HelpIntent': function () {
        var favoriteState;
        if (this.attributes['quizlet'].favorite == true) {
            favoriteState = this.t("UNMARK_FAVORITE");
        } else {
            favoriteState = this.t("MARK_FAVORITE");
        }
        var speechOutput = this.t("HELP_MESSAGE_SET_MENU", favoriteState, favoriteState, this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'UnMarkUserSetFavorite': function (set_id) {
        var set_id = this.attributes['quizlet'].set.id;
        quizlet.unmarkUserSetFavorite(set_id)
            .then((data) => {
                var speechOutput = this.t("UNMARKED_FAVORITE");
                this.attributes['quizlet'].favorite = false;
                this.handler.state = states.SETMENU;
                this.emitWithState('SetMenu', speechOutput);
            })
            .catch((err) => {
                console.error('error getting set: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    },
    'MarkUserSetFavorite': function (set_id) {
        var set_id = this.attributes['quizlet'].set.id;
        quizlet.markUserSetFavorite(set_id)
            .then((data) => {
                var speechOutput = this.t("MARKED_FAVORITE");
                this.attributes['quizlet'].favorite = true;
                this.handler.state = states.SETMENU;
                this.emitWithState('SetMenu', speechOutput);
            })
            .catch((err) => {
                console.error('error getting set: ' + err);
                this.emit(':tell', this.t("QUIZLETERROR"));
            });
    }
});

var reviewMenuHandlers = Alexa.CreateStateHandler(states.REVIEWMENU, {
    'ReviewMenu': function () {
        var speechOutput = this.t("REVIEW_MENU");
        var repromptSpeech = this.t("REVIEW_MENU_REPROMPT");
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'ReviewByTermIntent': function () {
        this.handler.state = states.REVIEWMENU;
        this.emitWithState('ByTermIntent');
    },
    'ReviewByDefinitionIntent': function () {
        this.handler.state = states.REVIEWMENU;
        this.emitWithState('ByDefinitionIntent');
    },
    'ByTermIntent': function () {
        this.attributes['quizlet'].reviewByTerm = true;
        this.handler.state = states.REVIEWING;
        this.emitWithState('ReviewSet');
    },
    'ByDefinitionIntent': function () {
        this.attributes['quizlet'].reviewByTerm = false;
        this.handler.state = states.REVIEWING;
        this.emitWithState('ReviewSet');
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.REVIEWMENU;
        this.emitWithState('ReviewMenu');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu');
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE_REVIEW_MENU", this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
});

var reviewingHandlers = Alexa.CreateStateHandler(states.REVIEWING, {
    'ReviewSet': function () {
        this.attributes['quizlet'].index = 0;
        var speechOutput;
        if (this.attributes['quizlet'].reviewByTerm == true) {
            speechOutput = this.t("LETS_BEGIN") + this.t("NEXT_AFTER_EACH_TERM") + "<break time=\"1s\"/>";
        } else {
            speechOutput = this.t("LETS_BEGIN") + this.t("NEXT_AFTER_EACH_DEFINITION") + "<break time=\"1s\"/>";
        }
        this.handler.state = states.REVIEWING;
        this.emitWithState('Reviewing', speechOutput);
    },
    'Reviewing': function (prefix) {
        var set = this.attributes['quizlet'].set;
        var index = this.attributes['quizlet'].index;
        var speechOutput = (prefix || "");
        var repromptSpeech;
        if (this.attributes['quizlet'].reviewByTerm == true) {
            speechOutput += this.t("TERM") + "<break time=\"300ms\"/>" + set.terms[index].term + "<break time=\"1s\"/>";
            speechOutput += this.t("DEFINITION") + "<break time=\"300ms\"/>" + set.terms[index].definition;
            repromptSpeech = this.t("NEXT_TERM_REPROMPT");
        } else {
            speechOutput += this.t("DEFINITION") + "<break time=\"300ms\"/>" + set.terms[index].definition + "<break time=\"1s\"/>";
            speechOutput += this.t("TERM") + "<break time=\"300ms\"/>" + set.terms[index].term;
            repromptSpeech = this.t("NEXT_DEFINITION_REPROMPT");
        }
        this.attributes["reprompt"] = repromptSpeech;
        if (index == (set.terms.length - 1)) {
            speechOutput += "<break time=\"500ms\"/>" + this.t("REVIEW_COMPLETE") + "<break time=\"1s\"/>";
            this.handler.state = states.SETMENU;
            this.emitWithState('SetMenu', speechOutput);
        } else {
            this.emit(':ask', speechOutput, repromptSpeech);
        }
    },
    'AMAZON.NextIntent': function () {
        this.attributes['quizlet'].index += 1;
        this.handler.state = states.REVIEWING;
        this.emitWithState('Reviewing');
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.REVIEWING;
        this.emitWithState('Reviewing');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu');
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput;
        if (this.attributes['quizlet'].reviewByTerm == true) {
            speechOutput = this.t("HELP_MESSAGE_REVIEWING_BY_TERM", this.t("HOW_CAN_I_HELP"));
        } else {
            speechOutput = this.t("HELP_MESSAGE_REVIEWING_BY_DEFINITION", this.t("HOW_CAN_I_HELP"));
        }
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
});

var quizMenuHandlers = Alexa.CreateStateHandler(states.QUIZMENU, {
    'QuizMenu': function () {
        var speechOutput = this.t("QUIZ_MENU");
        var repromptSpeech = this.t("QUIZ_MENU_REPROMPT");
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'ByDefinitionIntent': function () {
        this.handler.state = states.QUIZMENU;
        this.emitWithState('DefinitionsQuizIntent');
    },
    'DefinitionsQuizIntent': function () {
        var set = this.attributes['quizlet'].set;
        this.attributes['quizlet'].quiz_terms = shuffle.pick(set.terms, { 'picks': Math.min(ITEMS_PER_QUIZ, set.terms.length) });
        this.attributes['quizlet'].correct = 0;
        this.attributes['quizlet'].index = 0;
        var questions = this.attributes['quizlet'].quiz_terms.length;
        var speechOutput = this.t("LETS_BEGIN") + this.t("THERE_WILL_BE_X_QUESTIONS", questions) + "<break time=\"500ms\"/>";
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('GenerateQuestion', speechOutput);
    },
    'ByTermIntent': function () {
        this.handler.state = states.QUIZMENU;
        this.emitWithState('TermsQuizIntent');
    },
    'TermsQuizIntent': function () {
        var set = this.attributes['quizlet'].set;
        this.attributes['quizlet'].quiz_terms = shuffle.pick(set.terms, { 'picks': Math.min(ITEMS_PER_QUIZ, set.terms.length) });
        this.attributes['quizlet'].correct = 0;
        this.attributes['quizlet'].index = 0;
        var questions = this.attributes['quizlet'].quiz_terms.length;
        var speechOutput = this.t("LETS_BEGIN") + this.t("THERE_WILL_BE_X_QUESTIONS", questions) + "<break time=\"500ms\"/>";
        this.handler.state = states.TERMSQUIZ;
        this.emitWithState('GenerateQuestion', speechOutput);
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.QUIZMENU;
        this.emitWithState('QuizMenu');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu');
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE_QUIZ_MENU", this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
});

var termsQuizHandlers = Alexa.CreateStateHandler(states.TERMSQUIZ, {
    'GenerateQuestion': function (prefix) {
        if (this.attributes['quizlet'].index == this.attributes['quizlet'].quiz_terms.length) {
            var correct = this.attributes['quizlet'].correct;
            var questions = this.attributes['quizlet'].quiz_terms.length;
            var praise = "";
            if ((correct / questions) == 1) {
                praise = this.t("GREAT_WORK");
            } else if ((correct / questions) >= GOOD_PERCENTAGE) {
                praise = this.t("GOOD_JOB");
            }
            var speechOutput = (prefix || "") + this.t("QUIZ_COMPLETE") + this.t("NUMBER_OF_QUESTIONS_CORRECT", correct, questions) + praise;
            this.handler.state = states.SETMENU;
            this.emitWithState('SetMenu', speechOutput);
        } else {
            this.attributes['quizlet'].correct_answer = shuffle.pick([true, false]);
            if (this.attributes['quizlet'].correct_answer == true) {
                this.attributes['quizlet'].choice_index = this.attributes['quizlet'].quiz_terms[this.attributes['quizlet'].index].rank;
            } else {
                var random;
                do {
                    random = getRandomNumber(0, this.attributes['quizlet'].set.terms.length - 1);
                } while (random == this.attributes['quizlet'].quiz_terms[this.attributes['quizlet'].index].rank);
                this.attributes['quizlet'].choice_index = random;
            }
            this.handler.state = states.TERMSQUIZ;
            this.emitWithState('AskQuestion', prefix);
        }
    },
    'AskQuestion': function (prefix) {
        var term = this.attributes['quizlet'].quiz_terms[this.attributes['quizlet'].index].term;
        var definition = this.attributes['quizlet'].set.terms[this.attributes['quizlet'].choice_index].definition;
        var speechOutput = (prefix || "") + this.t("DOES_TERM_MEAN_DEFINITION", term, definition);
        var repromptSpeech = this.t("TERMS_QUIZ_REPROMPT");
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'AMAZON.YesIntent': function () {
        var speechOutput;
        if (this.attributes['quizlet'].correct_answer == true) {
            var speechOutput = this.t("CORRECT");
            this.attributes['quizlet'].correct += 1;
        } else {
            var speechOutput = this.t("INCORRECT");
        }
        this.attributes['quizlet'].index += 1;
        this.handler.state = states.TERMSQUIZ;
        this.emitWithState('GenerateQuestion', speechOutput);
    },
    'AMAZON.NoIntent': function () {
        var speechOutput;
        if (this.attributes['quizlet'].correct_answer == false) {
            var speechOutput = this.t("CORRECT");
            this.attributes['quizlet'].correct += 1;
        } else {
            var speechOutput = this.t("INCORRECT");
        }
        this.attributes['quizlet'].index += 1;
        this.handler.state = states.TERMSQUIZ;
        this.emitWithState('GenerateQuestion', speechOutput);
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.TERMSQUIZ;
        this.emitWithState('AskQuestion');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu');
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_TERMS_QUIZ_MENU", this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var definitionsQuizHandlers = Alexa.CreateStateHandler(states.DEFINITIONSQUIZ, {
    'GenerateQuestion': function (prefix) {
        if (this.attributes['quizlet'].index == this.attributes['quizlet'].quiz_terms.length) {
            var correct = this.attributes['quizlet'].correct;
            var questions = this.attributes['quizlet'].quiz_terms.length;
            var praise = "";
            if ((correct / questions) == 1) {
                praise = this.t("GREAT_WORK");
            } else if ((correct / questions) >= GOOD_PERCENTAGE) {
                praise = this.t("GOOD_JOB");
            }
            var speechOutput = (prefix || "") + this.t("QUIZ_COMPLETE") + this.t("NUMBER_OF_QUESTIONS_CORRECT", correct, questions) + praise;
            this.handler.state = states.SETMENU;
            this.emitWithState('SetMenu', speechOutput);
        } else {
            this.attributes['quizlet'].choice_index = [];
            var contains_real_answer = false;
            var set = this.attributes['quizlet'].set;
            var possible_answers = shuffle.pick(set.terms, { 'picks': Math.min(3, set.terms.length) });
            for (var i = 0; i < possible_answers.length; i++) {
                var rank = possible_answers[i].rank;
                if (rank == this.attributes['quizlet'].quiz_terms[this.attributes['quizlet'].index].rank) {
                    contains_real_answer = true;
                    this.attributes['quizlet'].correct_answer = i;
                }
                this.attributes['quizlet'].choice_index.push(possible_answers[i].rank);
            }
            if (contains_real_answer != true) {
                var answer = getRandomNumber(0, this.attributes['quizlet'].choice_index.length - 1);
                this.attributes['quizlet'].choice_index[answer] = this.attributes['quizlet'].quiz_terms[this.attributes['quizlet'].index].rank;
                this.attributes['quizlet'].correct_answer = answer;
            }
            this.handler.state = states.DEFINITIONSQUIZ;
            this.emitWithState('AskQuestion', prefix);
        }
    },
    'AskQuestion': function (prefix) {
        var choice_index = this.attributes['quizlet'].choice_index;
        var definition = this.attributes['quizlet'].quiz_terms[this.attributes['quizlet'].index].definition;
        var speechOutput = (prefix || "") + this.t("WHICH_DEFINITION_MATCHES") + "<break time=\"1s\"/>" + definition + "<break time=\"1s\"/>";
        for (var i = 0; i < choice_index.length; i++) {
            var option = this.attributes['quizlet'].set.terms[choice_index[i]].term;
            speechOutput += this.t("TERM") + "<say-as interpret-as=\"cardinal\">" + (i + 1) + "</say-as>. " + option;
            if (i != (choice_index.length - 1)) {
                speechOutput += "<break time=\"1s\"/>";
            }
        }
        var repromptSpeech = this.t("DEFINITIONS_QUIZ_REPROMPT");
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'TermOneIntent': function () {
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('OneIntent');
    },
    'TermTwoIntent': function () {
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('TwoIntent');
    },
    'TermThreeIntent': function () {
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('ThreeIntent');
    },
    'OneIntent': function () {
        var speechOutput;
        if (this.attributes['quizlet'].correct_answer == 0) {
            var speechOutput = this.t("CORRECT");
            this.attributes['quizlet'].correct += 1;
        } else {
            var speechOutput = this.t("INCORRECT");
        }
        this.attributes['quizlet'].index += 1;
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('GenerateQuestion', speechOutput);
    },
    'TwoIntent': function () {
        var speechOutput;
        if (this.attributes['quizlet'].correct_answer == 1) {
            var speechOutput = this.t("CORRECT");
            this.attributes['quizlet'].correct += 1;
        } else {
            var speechOutput = this.t("INCORRECT");
        }
        this.attributes['quizlet'].index += 1;
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('GenerateQuestion', speechOutput);
    },
    'ThreeIntent': function () {
        var length = this.attributes['quizlet'].choice_index.length;
        if (length < 3) {
            this.handler.state = states.DEFINITIONSQUIZ;
            this.emitWithState('Unhandled');
        } else {
            var speechOutput;
            if (this.attributes['quizlet'].correct_answer == 2) {
                var speechOutput = this.t("CORRECT");
                this.attributes['quizlet'].correct += 1;
            } else {
                var speechOutput = this.t("INCORRECT");
            }
            this.attributes['quizlet'].index += 1;
            this.handler.state = states.DEFINITIONSQUIZ;
            this.emitWithState('GenerateQuestion', speechOutput);
        }
    },
    'AMAZON.RepeatIntent': function () {
        this.handler.state = states.DEFINITIONSQUIZ;
        this.emitWithState('AskQuestion');
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StartOverIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('SetMenu');
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_DEFINITIONS_QUIZ_MENU", this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseToken(access_token) {
    var token = {};
    token.user_id = access_token.split('|')[0];
    token.access_token = access_token.substring(access_token.indexOf('|') + 1);
    return token;
}

const languageStrings = {
    "en-US": {
        "translation": {
            "SKILL_NAME": "Quizlexa",
            "WELCOME_MESSAGE": "Welcome to %s. ",
            "HOW_CAN_I_HELP": "How can I help you? ",
            "HELP_ME": "For instructions on what you can say, please say help me. ",
            "STOP_MESSAGE": "Goodbye! ",
            "NO_UNDERSTAND": "Sorry, I don't quite understand what you mean. ",
            "MAIN_MENU": "You can ask me to find a favorite set, find a set, or find a class. ",
            "MAIN_MENU_REPROMPT": "You can ask me to find a favorite set, find a set, or find a class, or say help me. ",
            "HELP_MESSAGE_MAIN_MENU": "Say find a favorite set to find one of your favorite sets. Say find a set to find one of your sets. Say find a class to find one of your classes. Say repeat to hear the commands again or you can say exit...Now, %s",
            "LINK_ACCOUNT": "Your Quizlet account is not linked. Please use the Alexa app to link your account. ",
            "NO_SETS": "You do not have any sets yet. Go to Quizlet dot com and add some sets to use. Goodbye! ",
            "NO_FAVORITE_SETS": "You do not have any favorite sets yet. ",
            "NO_CLASS_SETS": "You do not have any sets in this class yet. ",
            "NO_CLASSES": "You have not set up any classes set up yet. ",
            "ONE_SET": "You have one set. ",
            "ONE_FAVORITE_SET": "You have one favorite set. ",
            "ONE_CLASS_SET": "You have one set in this class. ",
            "ONE_CLASS": "You have one class. ",
            "LAST_SET": "The name of the last set you used is %s. ",
            "SET": "Set ",
            "CLASS": "Class ",
            "USE_SET": "Do you want to use this set? ",
            "USE_SET_REPROMPT": "Say yes to use the set. Say no to find new sets or classes or say help me. ",
            "HELP_MESSAGE_USE_SET": "Say yes to use the set. Say no to find new sets or classes. Say repeat to hear the set name again or you can say exit. Now, %s",
            "USE_CLASS": "Do you want to use this class? ",
            "USE_CLASS_REPROMPT": "Say yes to use the class. Say no to find new sets or classes or say help me. ",
            "HELP_MESSAGE_USE_CLASS": "Say yes to use the class. Say no to find new sets or classes. Say repeat to hear the class name again or you can say exit. Now, %s",
            "CHOOSE_SET": "Please choose from the following sets. ",
            "CHOOSE_SET_REPROMPT": "Say the number of the set you want. %s or say help me",
            "SAY_NEXT_MORE_SETS": "Say next for more sets. ",
            "HELP_MESSAGE_CHOOSE_SET": "Say the number of the set you want. %s Say repeat to hear the choices again. Say start over to find new sets or classes or you can say exit. Now, %s",
            "CHOOSE_CLASS": "Please choose from the following classes. ",
            "CHOOSE_CLASS_REPROMPT": "Say the number of the class you want. %s or say help me",
            "SAY_NEXT_MORE_CLASSES": "Say next for more classes. ",
            "HELP_MESSAGE_CHOOSE_CLASS": "Say the number of the class you want. %s Say repeat to hear the choices again. Say start over to find new sets or classes or you can say exit. Now, %s",
            "SET_NAME_IS": "The set name is %s. ",
            "CLASS_NAME_IS": "The class name is %s. ",
            "CHOSEN_SET": "You have chosen the set named<break time=\"100ms\"/>%s. ",
            "SET_HAS_X_TERMS": "This set has %s terms. ",
            "SET_MENU": "You can ask me to review the set, take a quiz, or %s.",
            "SET_MENU_REPROMPT": "You can ask me to review the set, take a quiz, %s, or say help me. ",
            "HELP_MESSAGE_SET_MENU": "Say review the set to review terms and definitions. Say take a quiz to take a quiz. Say %s to %s. Say repeat to hear the commands again. Say start over to find new sets or classes or you can say exit. Now, %s",
            "MARK_FAVORITE": "mark the set as a favorite",
            "UNMARK_FAVORITE": "unmark the set as a favorite",
            "MARKED_FAVORITE": "Great! I have marked this set as a favorite. ",
            "UNMARKED_FAVORITE": "I have unmarked this set as a favorite. ",
            "REVIEW_MENU": "You can ask me to review by term or review by definition. ",
            "REVIEW_MENU_REPROMPT": "You can ask me to review by term, review by definition, or say help me. ",
            "HELP_MESSAGE_REVIEW_MENU": "Say review by term to review the set starting with the term. Say review by definition to review the set starting with the definition. Say repeat to hear the commands again. Say start over to do other things with this set or you can say exit...Now, %s",
            "LETS_BEGIN": "Let's begin. ",
            "THERE_WILL_BE_X_QUESTIONS": "There will be %s questions. ",
            "NEXT_AFTER_EACH_TERM": "Say next after each term. ",
            "NEXT_AFTER_EACH_DEFINITION": "Say next after each definition. ",
            "TERM": "Term ",
            "DEFINITION": "Definition ",
            "REVIEW_COMPLETE": "Review Complete. ",
            "NEXT_TERM_REPROMPT": "Say next for the next term. Say repeat to hear the term again or say help me. ",
            "NEXT_DEFINITION_REPROMPT": "Say next for the next definition.  Say repeat to hear the defintion again or say help me. ",
            "HELP_MESSAGE_REVIEWING_BY_TERM": "Say next for the next term. Say repeat to hear the term again. Say start over to do other things with this set or you can say exit. Now, %s",
            "HELP_MESSAGE_REVIEWING_BY_DEFINITION": "Say next for the next definition. Say repeat to hear the term again. Say start over to do other things with this set or you can say exit. Now, %s",
            "QUIZ_MENU": "You can ask me to take a terms quiz or take a definitions quiz. ",
            "QUIZ_MENU_REPROMPT": "You can ask me to take a terms quiz or take a definitions quiz, or say help me. ",
            "HELP_MESSAGE_QUIZ_MENU": "Say take a terms quiz to take a terms quiz. Say take a definitions quiz to take a definitions quiz. Say repeat to hear the commands again. Say start over to do other things with this set or you can say exit...Now, %s",
            "DOES_TERM_MEAN_DEFINITION": "Does the term %s mean %s? ",
            "QUIZ_COMPLETE": "Quiz Complete. ",
            "CORRECT": "Correct! ",
            "INCORRECT": "Sorry, that is incorrect. ",
            "TERMS_QUIZ_REPROMPT": "Say yes if you believe the statement is true. Say no if you believe the statement is false. Say repeat to hear the question again or say help me. ",
            "HELP_TERMS_QUIZ_MENU": "Say yes if you believe the statement is true. Say no if you believe the statement is false. Say repeat to hear the question again. Say start over to do other things with this set or you can say exit...Now, %s",
            "DEFINITIONS_QUIZ_REPROMPT": "Say the number of the term you believe matches the definition. Say repeat to hear the definition and choices again or say help me",
            "HELP_DEFINITIONS_QUIZ_MENU": "Say the number of the term you believe matches the definition. Say repeat to hear the definition and choices again. Say start over to do other things with this set or you can say exit...Now, %s",
            "WHICH_DEFINITION_MATCHES": "Which term matches the definition ",
            "NUMBER_OF_QUESTIONS_CORRECT": "You got %s questions out of %s correct. ",
            "GREAT_WORK": "Great work! ",
            "GOOD_JOB": "Good job. ",
            "UNEXPECTED": "An unexpected error has occurred. Please try again later! ",
            "QUIZLETERROR": "There was an error communicating with Quizlet. Please try again later! ",
            "NOTIMPL": "This code path is not yet implemented. "
        }
    }
};