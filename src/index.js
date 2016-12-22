'use strict';

const Alexa = require('alexa-sdk');
var APP_ID = undefined; // TODO replace with your app ID (OPTIONAL).

var QuizletAPI = require('quizlet-api').QuizletAPI;
var quizlet = new QuizletAPI('', '');

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    alexa.resources = languageStrings;
    alexa.registerHandlers(entryPointHandlers,
        mainMenuHandlers,
        queryQuizletHandlers,
        confirmSingleSetHandlers,
        setMenuHandlers);
    alexa.execute();
};

function parseToken(access_token) {
    var token = {};
    token.user_id = access_token.split('|')[0];
    token.access_token = access_token.substring(access_token.indexOf('|') + 1);
    return token;
}

var entryPointHandlers = {
    'LaunchRequest': function () {
        var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
        var accessToken = this.event.session.user.accessToken;
        this.handler.state = states.MAINMENU;
        if (!accessToken) {
            this.emitWithState('LinkAccountIntent');
        }
        var token = parseToken(accessToken);
        quizlet.access_token = token.access_token;
        quizlet.user_id = token.user_id;
        this.emitWithState('PromptMainMenu', speechOutput);
    }
}

var states = {
    MAINMENU: '_MAINMENU',
    QUERYQUERYQUIZLET: '_QUERYQUERYQUIZLET',
    CONFIRMSINGLESET: '_CONFIRMSINGLESET',
    SETMENU: '_SETMENU'
};

var mainMenuHandlers = Alexa.CreateStateHandler(states.MAINMENU, {
    'PromptMainMenu': function (prefix) {
        var speechOutput = (prefix || "") + this.t("ASK_ME") + this.t("HOW_CAN_I_HELP");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'SelectFavoriteSetIntent': function () {
        this.handler.state = states.QUERYQUERYQUIZLET;
        this.emitWithState('QueryFavoriteSetIntent');
    },
    'SelectSetIntent': function () {
        this.handler.state = states.QUERYQUERYQUIZLET;
        this.emitWithState('QuerytSetIntent');
    },
    'LinkAccountIntent': function () {
        var accessToken = this.event.session.user.accessToken;
        if (!accessToken) {
            var speechOutput = this.t("LINK_ACCOUNT");
            this.emit(':tellWithLinkAccountCard', speechOutput);
        }
        var token = parseToken(accessToken);
        console.log('user_id: ' + token.user_id + ' access_token: ' + token.access_token);
        var speechOutput = this.t("LINKED", token.user_id, token.access_token);
        this.emit(':tell', speechOutput);
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE", this.t("ASK_ME"), this.t("HOW_CAN_I_HELP"));
        this.emit(':ask', speechOutput, speechOutput);
    },
    'AMAZON.CancelIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'AMAZON.StopIntent': function () {
        var speechOutput = this.t("STOP_MESSAGE");
        this.emit(':tell', speechOutput);
    },
    'Unhandled': function () {
        var speechOutput = this.t("NO_UNDERSTAND");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    }
});

var queryQuizletHandlers = Alexa.CreateStateHandler(states.QUERYQUERYQUIZLET, {
    'QueryFavoriteSetIntent': function () {
        quizlet.getUserFavorites()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = "You do not have any favorite sets yet. ";
                    this.handler.state = states.MAINMENU;
                    this.emitWithState('PromptMainMenu', speechOutput);
                }
                this.attributes['sets'] = {};
                this.attributes['sets'].data = data;
                this.attributes['sets'].index = 0;
                if (data.length == 1) {
                    this.handler.state = states.CONFIRMSINGLESET;
                    this.emitWithState('ConfirmSingleSetIntent');
                } else if (data.length <= 4) {
                    this.emit(':tell', "you have less than five sets. ");
                } else {
                    this.emit(':tell', "you have more than five sets. ");
                }
            })
            .catch((err) => { console.log('error: ' + err) });
    },
    'QuerytSetIntent': function () {
        quizlet.getUserSets()
            .then((data) => {
                if (data.length == 0) {
                    var speechOutput = "You do not have any sets yet. Go to Quizlet dot com and add some sets to use.  Goodbye!";
                    this.emit(':tell', speechOutput);
                }
                this.attributes['sets'] = {};
                this.attributes['sets'].data = data;
                this.attributes['sets'].index = 0;
                if (data.length == 1) {
                    this.handler.state = states.CONFIRMSINGLESET;
                    this.emitWithState('ConfirmSingleSetIntent');
                } else if (data.length <= 4) {
                    this.emit(':tell', "you have less than five sets. ");
                } else {
                    this.emit(':tell', "you have more than five sets. ");
                }
            })
            .catch((err) => { console.log('error: ' + err) });
    }
});

var confirmSingleSetHandlers = Alexa.CreateStateHandler(states.CONFIRMSINGLESET, {
    'ConfirmSingleSetIntent': function () {
        var title = this.attributes["sets"].data[this.attributes['sets'].index].title;
        this.emit(':ask', "Your set name is " + title + ".  Do you want to use this set? ");
    },
    'AMAZON.YesIntent': function () {
        this.handler.state = states.SETMENU;
        this.emitWithState('ConfirmSetIntent');
    },
    'AMAZON.NoIntent': function () {
        this.handler.state = states.MAINMENU;
        this.emitWithState('PromptMainMenu');
    }
});

var setMenuHandlers = Alexa.CreateStateHandler(states.SETMENU, {
    'ConfirmSetIntent': function () {
        var set = this.attributes["sets"].data[this.attributes['sets'].index];
        this.attributes["sets"].set = set;
        this.attributes["sets"].data = undefined;
        this.attributes["sets"].index = undefined;
        this.emit(':tell', "You have chosen the set named " + set.title + ". ");
    }
});

var languageStrings = {
    "en-US": {
        "translation": {
            "SKILL_NAME": "Quizlexa",
            "WELCOME_MESSAGE": "Welcome to %s. ",
            "HOW_CAN_I_HELP": "How can I help you? ",
            "ASK_ME": "You can ask me to select a favorite set or to just select one of your sets. ",
            "HELP_ME": "For instructions on what you can say, please say help me. ",
            "HELP_MESSAGE": "%s, or, you can say exit...Now, %s",
            "STOP_MESSAGE": "Goodbye! ",
            "NO_UNDERSTAND": "Sorry, I don't quite understand what you mean. ",
            "LINK_ACCOUNT": "Your Quizlet account is not linked.  Please use the Alexa app to link the account.",
            "LINKED": "Your account is linked.  User ID %s.  Access Token <say-as interpret-as=\"characters\">%s</say-as>. "
        }
    }
};