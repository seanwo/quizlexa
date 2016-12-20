'use strict';

const Alexa = require('alexa-sdk');
var APP_ID = undefined; // TODO replace with your app ID (OPTIONAL).

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    alexa.resources = languageStrings;
    alexa.registerHandlers(entryPointHandlers, mainMenuHandlers);
    alexa.execute();
};

var entryPointHandlers = {
    'LaunchRequest': function () {
        var speechOutput = this.t("WELCOME_MESSAGE", this.t("SKILL_NAME"));
        this.handler.state = states.MAINMENU;
        this.emitWithState('PromptMainMenu', speechOutput);
    }
}

var states = {
    MAINMENU: '_MAINMENU'
};

var mainMenuHandlers = Alexa.CreateStateHandler(states.MAINMENU, {
    'PromptMainMenu': function (prefix) {
        var speechOutput = (prefix || "") + this.t("ASK_ME") + this.t("HOW_CAN_I_HELP");
        var repromptSpeech = this.t("HELP_ME");
        this.emit(':ask', speechOutput, repromptSpeech);
    },
    'LinkAccountIntent': function () {
        var speechOutput = this.t("LINK_ACCOUNT");
        this.emit(':tellWithLinkAccountCard', speechOutput);
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

var languageStrings = {
    "en-US": {
        "translation": {
            "SKILL_NAME": "Quizlexa",
            "WELCOME_MESSAGE": "Welcome to %s. ",
            "HOW_CAN_I_HELP": "How can I help you? ",
            "ASK_ME": "You can ask me to link an account. ",
            "HELP_ME": "For instructions on what you can say, please say help me. ",
            "HELP_MESSAGE": "%s, or, you can say exit...Now, %s",
            "STOP_MESSAGE": "Goodbye! ",
            "NO_UNDERSTAND": "Sorry, I don't quite understand what you mean. ",
            "LINK_ACCOUNT": "Your Quizlet account is not linked.  Please use the Alexa app to link the account."
        }
    }
};