export type MatchKind = 'league' | 'independent';

export type PhotoCommentPreview = {
  id: string;
  body: string;
  authorName: string;
};

export type PhotoSummary = {
  id: string;
  blobUrl: string;
  width: number | null;
  height: number | null;
  uploaderId: string;
  uploaderName: string;
  uploaderAvatarUrl: string | null;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  /** True if the viewer has already liked this photo. */
  viewerLiked: boolean;
  /** True if the viewer can delete (uploader or SUPER_ADMIN). */
  canDelete: boolean;
  /** Most recent comment, used for an inline preview in the grid. */
  latestComment: PhotoCommentPreview | null;
};

export type PhotoCommentEntry = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  /** True if the viewer can delete this comment (author or SUPER_ADMIN). */
  canDelete: boolean;
};

export type PhotoDetail = PhotoSummary & {
  comments: PhotoCommentEntry[];
};
