// src/lib/featureFlags.ts
export type FeatureFlags = {
  quiz: boolean;        //理解チェック質問(quiz)を使うか
  concepts: boolean;    //定着度(user_concept_state)を使うか
};

function envBool(name: string, defaultValue: boolean) {
  const v = process.env[name];
  if (v == null) return defaultValue;
  return v === "1" || v.toLowerCase() === "true";
}

export const flags: FeatureFlags = {
  //未踏提出段階：quizも定着度も切る、みたいにできる
  quiz: envBool("FEATURE_QUIZ", false),
  concepts: envBool("FEATURE_CONCEPTS", false),
};