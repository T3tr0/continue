/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export type SessionInfo = SessionInfo1;
export type SessionId = string;
export type Title = string;
export type DateCreated = string;

export interface SessionInfo1 {
  session_id: SessionId;
  title: Title;
  date_created: DateCreated;
  [k: string]: unknown;
}
