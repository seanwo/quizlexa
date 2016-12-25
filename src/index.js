'use strict';

const Alexa = require('alexa-sdk');
var APP_ID = undefined; // TODO replace with your app ID (OPTIONAL).

const AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' })

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
        reviewMenuHandlers);
    alexa.execute();
};

const states = {
    MAINMENU: '_MAINMENU',
    CONFIRMNAVITEM: '_CONFIRMNAVITEM',
    SELECTNAVITEMFROMLIST: '_SELECTNAVITEMFROMLIST',
    SETMENU: '_SETMENU',
    REVIEWMENU: '_REVIEWMENU'
};

const dataType = {
    SET: 0,
    LAST_SET: 1,
    FAVORITE_SET: 2,
    CLASS_SET: 3,
    CLASS: 4
};

const ITEMS_PER_PAGE = 4;

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
        var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
        var accessToken = this.event.session.user.accessToken;
        this.handler.state = states.MAINMENU;
        if (!accessToken) {
            this.emitWithState('LinkAccountIntent');
        } else {
            var token = parseToken(accessToken);
            quizlet = new QuizletAPI(token.user_id, token.access_token);
            LoadSetId(this.event.session.user.userId)
                .then((data) => {
                    if ((data.Item !== undefined) && (data.Item.Data !== undefined)) {
                        this.handler.state = '';
                        this.emitWithState('QueryLastSet', data.Item.Data.S);
                    } else {
                        this.handler.state = states.MAINMENU;
                        this.emitWithState('MainMenu', speechOutput);
                    }
                })
                .catch((err) => {
                    console.error('error retrieving previous set: ' + err);
                    this.emit(":tell", this.t("UNEXPECTED"));
                });
        }
    },
    'Unhandled': function () {
        this.handler.state = '';
        this.emitWithState('LaunchRequest');
    },
    'QueryLastSet': function (set_id) {
        quizlet.getSet(set_id)
            .then((data) => {
                if (data.http_code) {
                    var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.LAST_SET;
                    this.attributes['quizlet'].data = new Array(data);
                    this.attributes['quizlet'].index = 0;
                    var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption', speechOutput);
                }
            })
            .catch((err) => {
                console.error('error getting set: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    }
}

var mainMenuHandlers = Alexa.CreateStateHandler(states.MAINMENU, {
    'MainMenu': function (prefix) {
        this.attributes['quizlet'] = undefined;
        var speechOutput = (prefix || "") + this.t("MAIN_MENU") + this.t("HOW_CAN_I_HELP");
        var repromptSpeech = this.t("MAIN_MENU_REPROMPT");
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
    'LinkAccountIntent': function () {
        var accessToken = this.event.session.user.accessToken;
        if (!accessToken) {
            var speechOutput = this.t("LINK_ACCOUNT");
            this.emit(':tellWithLinkAccountCard', speechOutput);
        } else {
            var token = parseToken(accessToken);
            console.log('user_id: ' + token.user_id + ' access_token: ' + token.access_token);
            var speechOutput = this.t("LINKED", token.user_id, token.access_token);
            this.emit(':tell', speechOutput);
        }
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
        var speechOutput = this.t("NO_UNDERSTAND");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'QueryUserSets': function () {
        quizlet.getUserSets()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_SETS");
                    this.emit(':tell', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.SET;
                    this.attributes['quizlet'].data = data;
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting sets: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    },
    'QueryUserFavorites': function () {
        quizlet.getUserFavorites()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_FAVORITE_SETS");
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.FAVORITE_SET;
                    this.attributes['quizlet'].data = data;
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting favorite sets: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    },
    'QueryUserClasses': function () {
        quizlet.getUserClasses()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_CLASSES");
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.CLASS;
                    this.attributes['quizlet'].data = data;
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting classes: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    },
    'QueryClassSets': function () {
        var class_id = this.attributes['quizlet'].class_id;
        quizlet.getClassSets(class_id)
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = this.t("NO_CLASS_SETS");
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('MainMenu', speechOutput);
                } else {
                    this.attributes['quizlet'] = {};
                    this.attributes['quizlet'].type = dataType.CLASS_SET;
                    this.attributes['quizlet'].data = data;
                    this.attributes['quizlet'].index = 0;
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting class sets: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
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
                this.emit(":tell", this.t("UNEXPECTED"));
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
        if (type === dataType.CLASS_SET) {
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
            if (paginate === true) {
                next = this.t("SAY_NEXT_MORE_CLASSES")
            }
            repromptSpeech = this.t("CHOOSE_CLASS_REPROMPT", next);
        } else {
            speechOutput = this.t("CHOOSE_SET") + "<break time=\"1s\"/>";
            data_type = this.t("SET");
            var next = "";
            if (paginate === true) {
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

        if (paginate === true) {
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
        if (paginate === true) {
            next = this.t("SAY_NEXT_MORE_CLASSES")
        }

        var speechOutput;
        if (type === dataType.CLASS) {
            speechOutput = this.t("HELP_MESSAGE_CHOOSE_CLASS", next, this.t("HOW_CAN_I_HELP"));
        } else {
            speechOutput = this.t("HELP_MESSAGE_CHOOSE_SET", next, this.t("HOW_CAN_I_HELP"));
        }
        this.emit(':ask', speechOutput, this.t("HELP_ME"));
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND") + this.attributes["reprompt"];;
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var setMenuHandlers = Alexa.CreateStateHandler(states.SETMENU, {
    'SelectSet': function () {
        var set = this.attributes['quizlet'].data[this.attributes['quizlet'].index];
        this.attributes['quizlet'] = {};
        this.attributes['quizlet'].set = set;
        this.attributes['quizlet'].shuffled = false;
        StoreSetId(this.event.session.user.userId, set.id)
            .then((data) => {
                this.handler.state = states.SETMENU;
                this.emitWithState('CheckIsFavorite');
            })
            .catch((err) => {
                console.error('error storing previous set: ' + err);
                this.emit(":tell", this.t("UNEXPECTED"));
            });
    },
    'CheckIsFavorite': function () {
        var id = this.attributes['quizlet'].set.id;
        quizlet.getUserFavorites()
            .then((data) => {
                this.attributes['quizlet'].favorite = false;
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id === id) {
                        this.attributes['quizlet'].favorite = true;
                        break;
                    }
                }
                this.handler.state = states.SETMENU;
                this.emitWithState('ReturnSetInfo');
            })
            .catch((err) => {
                console.error('error getting favorite sets: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
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
        if (this.attributes['quizlet'].favorite === true) {
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
        var speechOutput = "Quiz me intent. " + this.t("NOTIMPL");
        this.emit(":tell", speechOutput);
    },
    'SelectFavoriteSetIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('ToggleFavoriteIntent');
    },
    'ToggleFavoriteIntent': function () {
        if (this.attributes['quizlet'].favorite === true) {
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
        if (this.attributes['quizlet'].favorite === true) {
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
                this.emit(":tell", this.t("QUIZLETERROR"));
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
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    }
});

var reviewMenuHandlers = Alexa.CreateStateHandler(states.REVIEWMENU, {
    'ReviewMenu': function () {
        // if (this.attributes['quizlet'].shuffled === true) {
        this.attributes['quizlet'].set.terms.sort(compareRank);
        // }
        var speechOutput = this.t("REVIEW_MENU");
        var repromptSpeech = this.t("REVIEW_MENU_REPROMPT");
        this.attributes["reprompt"] = repromptSpeech;
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'ReviewByTermIntent': function () {
        this.emit(':tell', "Review by term. " + this.t("NOTIMPL"));
    },
    'ReviewByDefinitionIntent': function () {
        this.emit(':tell', "Review by definition. " + this.t("NOTIMPL"));
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

function compareRank(a, b) {
    return a.rank - b.rank;
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
            "HELP_MESSAGE_MAIN_MENU": "Say find a favorite set to find one of your favorite sets. Say find a set to find one of your sets.  Say find a class to find one of your classes. Say repeat to hear the commands again or you can say exit...Now, %s",

            "LINK_ACCOUNT": "Your Quizlet account is not linked.  Please use the Alexa app to link your account. ",

            "NO_SETS": "You do not have any sets yet. Go to Quizlet dot com and add some sets to use.  Goodbye! ",
            "NO_FAVORITE_SETS": "You do not have any favorite sets yet. ",
            "NO_CLASS_SETS": "You do not have any sets in this class yet. ",
            "NO_CLASSES": "You have not set up any classes set up yet. ",

            "ONE_SET": "You have one set. ",
            "ONE_FAVORITE_SET": "You have one favorite set. ",
            "ONE_CLASS_SET": "You have one set in this class. ",
            "ONE_CLASS": "You have one class. ",

            "LAST_SET": "The last Quizlet set you used is named %s. ",

            "SET": "Set ",
            "CLASS": "Class ",

            "USE_SET": "Do you want to use this set? ",
            "USE_SET_REPROMPT": "Say yes to use the set. Say no to find new sets or classes or say help me. ",
            "HELP_MESSAGE_USE_SET": "Say yes to use the set. Say no to find new sets or classes.  Say repeat to hear the set name again or you can say exit...Now, %s",

            "USE_CLASS": "Do you want to use this class? ",
            "USE_CLASS_REPROMPT": "Say yes to use the class. Say no to find new sets or classes or say help me. ",
            "HELP_MESSAGE_USE_CLASS": "Say yes to use the class. Say no to find new sets or classes.  Say repeat to hear the class name again or you can say exit...Now, %s",

            "CHOOSE_SET": "Please choose from the following sets. ",
            "CHOOSE_SET_REPROMPT": "Say the number of the set you want. %s or say help me",
            "SAY_NEXT_MORE_SETS": "Say next for more sets. ",
            "HELP_MESSAGE_CHOOSE_SET": "Say the number of the set you want. %s Say repeat to hear the choices again. Say start over to find new sets or classes or you can say exit...Now, %s",

            "CHOOSE_CLASS": "Please choose from the following classes. ",
            "CHOOSE_CLASS_REPROMPT": "Say the number of the class you want. %s or say help me",
            "SAY_NEXT_MORE_CLASSES": "Say next for more classes. ",
            "HELP_MESSAGE_CHOOSE_CLASS": "Say the number of the class you want. %s Say repeat to hear the choices again. Say start over to find new sets or classes or you can say exit...Now, %s",

            "SET_NAME_IS": "The Quizlet set name is %s. ",
            "CLASS_NAME_IS": "The class name is %s. ",

            "CHOSEN_SET": "You have chosen the set named %s. ",
            "SET_HAS_X_TERMS": "This set has %s terms. ",

            "SET_MENU": "You can ask me to review the set, quiz me, or %s.",
            "SET_MENU_REPROMPT": "You can ask me to review the set, quiz me, %s, or say help me. ",
            "HELP_MESSAGE_SET_MENU": "Say review the set to review terms and definitions. Say quiz me to take a quiz. Say %s to %s. Say repeat to hear the commands again. Say start over to find new sets or classes or you can say exit...Now, %s",

            "MARK_FAVORITE": "mark the set as a favorite",
            "UNMARK_FAVORITE": "unmark the set as a favorite",
            "MARKED_FAVORITE": "Great! I have marked this set as a favorite. ",
            "UNMARKED_FAVORITE": "I have unmarked this set as a favorite. ",

            "REVIEW_MENU": "You can ask me to review by term or review by definition. ",
            "REVIEW_MENU_REPROMPT": "You can ask me to review by term, review by definition, or say help me. ",
            "HELP_MESSAGE_REVIEW_MENU": "Say review by term to review the set starting with the term. Say review by definition to review the set starting with the definition. Say repeat to hear the commands again. Say start over to do other things with this set or you can say exit...Now, %s",

            "UNEXPECTED": "An unexpected error has occurred.  Please try again later! ",
            "QUIZLETERROR": "There was an error communicating with Quizlet.  Please try again later! ",
            "NOTIMPL": "This code path is not yet implemented. ",
            "LINKED": "Your account is linked.  User ID %s.  Access Token <say-as interpret-as=\"characters\">%s</say-as>. "
        }
    }
};