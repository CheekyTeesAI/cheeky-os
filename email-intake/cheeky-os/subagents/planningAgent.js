"use strict";

/**

 * Planning specialist — emits recommendations only (no autonomous execution).


 */




const recommendationEngine = require("../planning/recommendationEngine");


function recommend(goalText) {

  try {

      return recommendationEngine.recommendFromGoal(goalText);

    } catch (_e) {

      return {


        success: false,

        recommendations: [],


      };


    }


}





module.exports = {


  recommend,




};
