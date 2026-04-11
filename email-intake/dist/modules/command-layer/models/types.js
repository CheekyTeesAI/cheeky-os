"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityType = exports.LeadStatus = exports.LeadStage = void 0;
var LeadStage;
(function (LeadStage) {
    LeadStage["NEW"] = "NEW";
    LeadStage["CONTACTED"] = "CONTACTED";
    LeadStage["QUOTED"] = "QUOTED";
    LeadStage["FOLLOW_UP"] = "FOLLOW_UP";
    LeadStage["CLOSE_ATTEMPT"] = "CLOSE_ATTEMPT";
    LeadStage["DEPOSIT_PAID"] = "DEPOSIT_PAID";
    LeadStage["WON"] = "WON";
    LeadStage["LOST"] = "LOST";
})(LeadStage || (exports.LeadStage = LeadStage = {}));
var LeadStatus;
(function (LeadStatus) {
    LeadStatus["HOT"] = "HOT";
    LeadStatus["WARM"] = "WARM";
    LeadStatus["COLD"] = "COLD";
})(LeadStatus || (exports.LeadStatus = LeadStatus = {}));
var ActivityType;
(function (ActivityType) {
    ActivityType["call"] = "call";
    ActivityType["text"] = "text";
    ActivityType["email"] = "email";
    ActivityType["dm"] = "dm";
    ActivityType["walkin"] = "walkin";
    ActivityType["quote"] = "quote";
    ActivityType["note"] = "note";
})(ActivityType || (exports.ActivityType = ActivityType = {}));
