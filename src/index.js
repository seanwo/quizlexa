'use strict';

const Alexa = require('alexa-sdk');
var APP_ID = undefined; // TODO replace with your app ID (OPTIONAL).

const QuizletAPI = require('quizlet-api').QuizletAPI;
var quizlet = new QuizletAPI('', '');

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    alexa.resources = languageStrings;
    alexa.registerHandlers(entryPointHandlers,
        mainMenuHandlers,
        queryQuizletHandlers,
        confirmNavItemHandlers,
        selectNavItemFromListHandlers,
        setMenuHandlers);
    alexa.execute();
};

const states = {
    MAINMENU: '_MAINMENU',
    QUERYQUIZLET: '_QUERYQUIZLET',
    CONFIRMNAVITEM: '_CONFIRMNAVITEM',
    SELECTNAVITEMFROMLIST: '_SELECTNAVITEMFROMLIST',
    SETMENU: '_SETMENU'
};

const dataType = {
    SET: 0,
    FAVORITE_SET: 1,
    CLASS_SET: 2,
    CLASS: 3
};

const ITEMS_PER_PAGE = 4;

var entryPointHandlers = {
    'LaunchRequest': function () {
        var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
        var accessToken = this.event.session.user.accessToken;
        this.handler.state = states.MAINMENU;
        if (!accessToken) {
            this.emitWithState('LinkAccountIntent');
        } else {
            var token = parseToken(accessToken);
            quizlet.access_token = token.access_token;
            quizlet.user_id = token.user_id;
            this.emitWithState('MainMenu', speechOutput);
        }
    }
}

var mainMenuHandlers = Alexa.CreateStateHandler(states.MAINMENU, {
    'MainMenu': function (prefix) {
        this.attributes['quizlet'] = undefined;
        var speechOutput = (prefix || "") + this.t("ASK_ME") + this.t("HOW_CAN_I_HELP");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'SelectFavoriteSetIntent': function () {
        this.handler.state = states.QUERYQUIZLET;
        this.emitWithState('QueryUserFavorites');
    },
    'SelectSetIntent': function () {
        this.handler.state = states.QUERYQUIZLET;
        this.emitWithState('QueryUserSets');
    },
    'SelectClassIntent': function () {
        this.handler.state = states.QUERYQUIZLET;
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
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE", this.t("ASK_ME"), this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, speechOutput);
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var queryQuizletHandlers = Alexa.CreateStateHandler(states.QUERYQUIZLET, {
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
                    this.handler.state = states.QUERYQUIZLET;
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
                    this.handler.state = states.QUERYQUIZLET;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting favorite sets: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    },
    'QueryClassSets': function () {
        var class_id = this.attributes['quizlet'].class_id;
        console.log("class_id: " + class_id);
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
                    this.handler.state = states.QUERYQUIZLET;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting class sets: ' + err);
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
                    this.handler.state = states.QUERYQUIZLET;
                    this.emitWithState('SelectOption');
                }
            })
            .catch((err) => {
                console.error('error getting classes: ' + err);
                this.emit(":tell", this.t("QUIZLETERROR"));
            });
    },
    'SelectOption': function () {
        var length = this.attributes['quizlet'].data.length;
        if (length == 1) {
            this.handler.state = states.CONFIRMNAVITEM;
            this.emitWithState('ConfirmNavItem');
        } else {
            this.handler.state = states.SELECTNAVITEMFROMLIST;
            this.emitWithState('SelectNavItemFromList');
        }
    }
});

var confirmNavItemHandlers = Alexa.CreateStateHandler(states.CONFIRMNAVITEM, {
    'ConfirmNavItem': function () {
        var type = this.attributes['quizlet'].type;
        switch (type) {
            case dataType.SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = this.t("ONE_SET") + this.t("SET_NAME_IS", title) + this.t("ASK_USE_SET");
                var repromptSpeech = this.t("ASK_USE_SET_REPROMPT");
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.FAVORITE_SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = this.t("ONE_FAVORITE_SET") + this.t("SET_NAME_IS", title) + this.t("ASK_USE_SET");
                var repromptSpeech = this.t("ASK_USE_SET_REPROMPT");
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.CLASS_SET:
                var title = this.attributes['quizlet'].data[this.attributes['quizlet'].index].title;
                var speechOutput = this.t("ONE_CLASS_SET") + this.t("SET_NAME_IS", title) + this.t("ASK_USE_SET");
                var repromptSpeech = this.t("ASK_USE_SET_REPROMPT");
                this.emit(':ask', speechOutput, repromptSpeech);
                break;
            case dataType.CLASS:
                var name = this.attributes['quizlet'].data[this.attributes['quizlet'].index].name;
                var speechOutput = this.t("ONE_CLASS") + this.t("CLASS_NAME_IS", name) + this.t("ASK_USE_CLASS");
                var repromptSpeech = this.t("ASK_USE_CLASS_REPROMPT");
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
            this.handler.state = states.QUERYQUIZLET;
            this.emitWithState('QueryClassSets');
        } else {
            this.handler.state = states.SETMENU;
            this.emitWithState('ConfirmSetIntent');
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
        var speechOutput = this.t("UNDEFINED");
        this.emit(':ask', speechOutput, speechOutput);
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var selectNavItemFromListHandlers = Alexa.CreateStateHandler(states.SELECTNAVITEMFROMLIST, {
    'SelectNavItemFromList': function () {
        var data = this.attributes['quizlet'].data;
        var index = this.attributes['quizlet'].index;
        var speechOutput = this.t("ASK_CHOOSE_SET") + "<break time=\"1s\"/>";
        for (var i = 0; i < Math.min(ITEMS_PER_PAGE, data.length - index); i++) {
            speechOutput += this.t("SET") + "<say-as interpret-as=\"cardinal\">" + (i + 1) + "</say-as>. " + data[i + index].title + "<break time=\"1s\"/>";
        }
        var repromptSpeech = this.t("ASK_CHOOSE_SET_REPROMPTA");
        if (data.length - index > ITEMS_PER_PAGE) {
            speechOutput += this.t("OR_SAY_NEXT_MORE_SETS");
            repromptSpeech += this.t("SAY_NEXT_MORE_SETS");
        }
        repromptSpeech += this.t("ASK_CHOOSE_SET_REPROMPTB");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'SetOneIntent': function () {
        this.handler.state = states.SELECTNAVITEMFROMLIST;
        this.emitWithState('OneIntent');
    },
    'SetTwoIntent': function () {
        this.handler.state = states.SELECTNAVITEMFROMLIST;
        this.emitWithState('TwoIntent');
    },
    'SetThreeIntent': function () {
        this.handler.state = states.SELECTNAVITEMFROMLIST;
        this.emitWithState('ThreeIntent');
    },
    'SetFourIntent': function () {
        this.handler.state = states.SELECTNAVITEMFROMLIST;
        this.emitWithState('FourIntent');
    },
    'OneIntent': function () {
        var type = this.attributes['quizlet'].type;
        if (type == dataType.CLASS) {
            this.emit(":tell", this.t("NOTIMPL"));
        } else {
            this.handler.state = states.SETMENU;
            this.emitWithState('ConfirmSetIntent');
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
                this.emit(":tell", this.t("NOTIMPL"));
            } else {
                this.handler.state = states.SETMENU;
                this.emitWithState('ConfirmSetIntent');
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
                this.emit(":tell", this.t("NOTIMPL"));
            } else {
                this.handler.state = states.SETMENU;
                this.emitWithState('ConfirmSetIntent');
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
                this.emit(":tell", this.t("NOTIMPL"));
            } else {
                this.handler.state = states.SETMENU;
                this.emitWithState('ConfirmSetIntent');
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
        var speechOutput = this.t("UNDEFINED");
        this.emit(':ask', speechOutput, speechOutput);
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var setMenuHandlers = Alexa.CreateStateHandler(states.SETMENU, {
    'ConfirmSetIntent': function () {
        var set = this.attributes['quizlet'].data[this.attributes['quizlet'].index];
        this.attributes['quizlet'].set = set;
        this.attributes['quizlet'].data = undefined;
        this.attributes['quizlet'].index = undefined;
        this.emit(':tell', "You have chosen the set named " + set.title + ". It has " + set.terms.length + " terms in this set. ");
    }
});

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
            //"ASK_ME": "You can ask me to select a favorite set or, select a set, or select a class. ",
            "ASK_ME": " ",
            "HELP_ME": "For instructions on what you can say, please say help me. ",
            "HELP_MESSAGE": "%s, or, you can say exit...Now, %s",
            "STOP_MESSAGE": "Goodbye! ",
            "NO_UNDERSTAND": "Sorry, I don't quite understand what you mean. ",
            "LINK_ACCOUNT": "Your Quizlet account is not linked.  Please use the Alexa app to link your account. ",
            "NO_SETS": "You do not have any sets yet. Go to Quizlet dot com and add some sets to use.  Goodbye! ",
            "NO_FAVORITE_SETS": "You do not have any favorite sets yet. ",
            "NO_CLASS_SETS": "You do not have any class sets yet. ",
            "NO_CLASSES": "You have not set up any classes yet. ",
            "ONE_SET": "You have one set. ",
            "ONE_FAVORITE_SET": "You have one favorite set. ",
            "ONE_CLASS_SET": "You have one class set. ",
            "ONE_CLASS": "You have one class. ",
            "SET": "Set ",
            "CLASS": "Set ",
            "ASK_USE_SET": "Do you want to use this set? ",
            "ASK_USE_SET_REPROMPT": "Say yes to use the set. Say no to return to the main menu. Say repeat to hear the set again. Or say help me for more options. ",
            "ASK_USE_CLASS": "Do you want to use this class? ",
            "ASK_USE_CLASS_REPROMPT": "Say yes to use the class. Say no to return to the main menu. Say repeat to hear the class again. Or say help me for more options. ",

            "ASK_CHOOSE_SET": "Please choose from the following sets. ",
            "OR_SAY_NEXT_MORE_SETS": "Or say next for more sets. ",
            "ASK_CHOOSE_SET_REPROMPTA": "Say the number of the set you want. Say repeat to hear the choices again. ",
            "SAY_NEXT_MORE_SETS": "Say next for more sets. ",
            "ASK_CHOOSE_SET_REPROMPTB": "Or say help me to hear more options. ",
            "SET_NAME_IS": "Your set name is %s. ",
            "CLASS_NAME_IS": "Your class name is %s. ",
            "UNEXPECTED": "An unexpected error has occurred.  Please try again later! ",
            "QUIZLETERROR": "There was an error communicating with Quizlet.  Please try again later! ",
            "UNDEFINED": "This text is undefined. ",
            "NOTIMPL": "This code path is not yet implemented. ",
            "LINKED": "Your account is linked.  User ID %s.  Access Token <say-as interpret-as=\"characters\">%s</say-as>. "
        }
    }
};