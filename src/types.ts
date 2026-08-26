export interface D2LPagingInfo {
  Bookmark?: string | null;
  HasMoreItems?: boolean;
}

export interface D2LPagedResult<T> {
  Items: T[];
  PagingInfo?: D2LPagingInfo;
}

export interface D2LOrgUnitTypeInfo {
  Id?: number;
  Code?: string;
  Name?: string;
}

export interface D2LOrgUnitInfo {
  Id: number;
  Type?: D2LOrgUnitTypeInfo;
  Name: string;
  Code?: string;
  HomeUrl?: string;
}

export interface D2LMyOrgUnitInfo {
  OrgUnit: D2LOrgUnitInfo;
  Access?: {
    IsActive?: boolean;
    StartDate?: string | null;
    EndDate?: string | null;
    CanAccess?: boolean;
    ClasslistRoleName?: string | null;
    LISRoles?: string[];
    LastAccessed?: string | null;
  };
  PinDate?: string | null;
}

export interface Course {
  id: number;
  name: string;
  code: string | null;
  homeUrl: string;
  isPinned: boolean;
  pinDate: string | null;
  isActive: boolean;
  canAccess: boolean;
  startDate: string | null;
  endDate: string | null;
  lastAccessed: string | null;
  roleName: string | null;
}

export interface D2LTopic {
  TopicId: number;
  Identifier?: string;
  TypeIdentifier?: string;
  Title: string;
  Bookmarked?: boolean;
  Unread?: boolean;
  Url?: string | null;
  SortOrder?: number;
  StartDateTime?: string | null;
  EndDateTime?: string | null;
  DueDate?: string | null;
  ActivityId?: string | null;
  CompletionType?: number;
  IsExempt?: boolean;
  IsHidden?: boolean;
  IsLocked?: boolean;
  IsBroken?: boolean;
  ToolId?: number | null;
  ToolItemId?: number | null;
  ActivityType?: number;
  GradeItemId?: number | null;
  LastModifiedDate?: string | null;
}

export interface D2LModule {
  ModuleId: number;
  Title: string;
  SortOrder?: number;
  StartDateTime?: string | null;
  EndDateTime?: string | null;
  DueDate?: string | null;
  Modules?: D2LModule[];
  Topics?: D2LTopic[];
  IsHidden?: boolean;
  IsLocked?: boolean;
  DefaultPath?: string;
  LastModifiedDate?: string | null;
}

export interface D2LTableOfContents {
  Modules: D2LModule[];
}

export interface CourseWeek {
  courseId: number;
  moduleId: number;
  title: string;
  weekNumber: number | null;
  path: string[];
  startDate: string | null;
  endDate: string | null;
  lastModifiedDate: string | null;
  documentCount: number;
}

export interface CourseDocument {
  courseId: number;
  courseName?: string;
  moduleId: number;
  moduleTitle: string;
  modulePath: string[];
  topicId: number;
  title: string;
  url: string | null;
  typeIdentifier: string | null;
  activityType: number | null;
  isFile: boolean;
  isLink: boolean;
  isHidden: boolean;
  isLocked: boolean;
  isBroken: boolean;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  lastModifiedDate: string | null;
  webUrl: string;
}

export interface D2LContentObject {
  Id: number;
  Title: string;
  ShortTitle?: string;
  Type: 0 | 1;
  TopicType?: number;
  Url?: string | null;
  StartDate?: string | null;
  EndDate?: string | null;
  DueDate?: string | null;
  IsHidden?: boolean;
  IsLocked?: boolean;
  IsBroken?: boolean;
  ParentModuleId?: number | null;
  ActivityType?: number;
  LastModifiedDate?: string | null;
}
