import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

// Function to extract video ID from Loom URL
function extractVideoId(url: string): string | null {
	try {
		// Extract the part after "share/" and before any query parameters
		const regex = /\/share\/([^/?]+)/;
		const match = url.match(regex);
		return match ? match[1] : null;
	} catch (error) {
		console.error("Error extracting video ID:", error);
		return null;
	}
}

// Function to fetch transcript URL from Loom API
async function fetchTranscriptUrl(videoId: string): Promise<string | null> {
	try {
		const response = await fetch("https://www.loom.com/graphql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "loom-transcript-mcp/1.0.0",
			},
			body: JSON.stringify({
				operationName: "FetchVideoTranscript",
				variables: {
					videoId: videoId,
					password: null,
				},
				query: `query FetchVideoTranscript($videoId: ID!, $password: String) {
          fetchVideoTranscript(videoId: $videoId, password: $password) {
            ... on VideoTranscriptDetails {
              id
              video_id
              s3_id
              version
              transcript_url
              captions_url
              processing_service
              transcription_status
              processing_start_time
              processing_end_time
              createdAt
              updatedAt
              source_url
              captions_source_url
              filler_words
              filler_word_removal
              __typename
            }
            ... on GenericError {
              message
              __typename
            }
            __typename
          }
        }`,
			}),
		});

		const data = (await response.json()) as {
			data?: {
				fetchVideoTranscript?: {
					captions_source_url?: string;
				};
			};
		};

		console.log("API Response:", JSON.stringify(data, null, 2));

		if (data?.data?.fetchVideoTranscript?.captions_source_url) {
			return data.data.fetchVideoTranscript.captions_source_url;
		}

		return null;
	} catch (error) {
		console.error("Error fetching transcript URL:", error);
		return null;
	}
}

// Function to fetch and parse VTT content
async function fetchVttContent(url: string): Promise<string> {
	try {
		console.log("Fetching VTT from URL:", url);
		const response = await fetch(url);
		console.log("VTT Response status:", response.status);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const vttContent = await response.text();
		return parseVttToText(vttContent);
	} catch (error) {
		console.error("Error fetching VTT content:", error);
		throw new Error(
			`Failed to fetch transcript: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

// Function to parse VTT file content to plain text
function parseVttToText(vttContent: string): string {
	// Remove WebVTT header and metadata
	const lines = vttContent.split("\n");
	let transcript = "";

	for (const line of lines) {
		// Skip WebVTT header, timestamps, and empty lines
		if (
			line.includes("-->") ||
			line.trim() === "" ||
			line.match(/^\d+$/) ||
			line.startsWith("WEBVTT")
		) {
			continue;
		}
		// Add the content line to the transcript
		transcript += line.trim() + " ";
	}

	return transcript.trim();
}

// Types for video metadata
interface VideoThumbnails {
	staticUrl: string | null;
	animatedUrl: string | null;
	withPlayUrl: string | null;
}

interface VideoMetadata {
	title: string;
	description: string | null;
	thumbnails: VideoThumbnails;
}

const LOOM_CDN_BASE = "https://cdn.loom.com/";

// Function to fetch video metadata from Loom API
async function fetchVideoMetadata(
	videoId: string,
): Promise<VideoMetadata | null> {
	try {
		const response = await fetch("https://www.loom.com/graphql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "loom-transcript-mcp/1.0.0",
			},
			body: JSON.stringify({
				operationName: "GetVideoInfo",
				variables: {
					id: videoId,
					password: null,
				},
				query: `query GetVideoInfo($id: ID!, $password: String) {
  getVideo(id: $id, password: $password) {
    ... on RegularUserVideo {
      id
      name
      description
      defaultThumbnails {
        default
        static
      }
      signedThumbnails {
        defaultGifPlay
      }
      __typename
    }
    ... on PrivateVideo {
      id
      __typename
    }
    ... on CMSUserVideo {
      id
      name
      description
      __typename
    }
    __typename
  }
}`,
			}),
		});

		const data = (await response.json()) as {
			data?: {
				getVideo?: {
					name?: string;
					description?: string;
					defaultThumbnails?: {
						default?: string;
						static?: string;
					};
					signedThumbnails?: {
						defaultGifPlay?: string;
					};
				};
			};
		};

		console.log("Video metadata response:", JSON.stringify(data, null, 2));

		const video = data?.data?.getVideo;
		if (video?.name) {
			return {
				title: video.name,
				description: video.description || null,
				thumbnails: {
					staticUrl: video.defaultThumbnails?.static
						? LOOM_CDN_BASE + video.defaultThumbnails.static
						: null,
					animatedUrl: video.defaultThumbnails?.default
						? LOOM_CDN_BASE + video.defaultThumbnails.default
						: null,
					withPlayUrl: video.signedThumbnails?.defaultGifPlay
						? LOOM_CDN_BASE + video.signedThumbnails.defaultGifPlay
						: null,
				},
			};
		}

		return null;
	} catch (error) {
		console.error("Error fetching video metadata:", error);
		return null;
	}
}

// Types for video comments
interface CommentReply {
	id: string;
	content: string;
	plainContent: string;
	time_stamp: number | null;
	user_name: string;
	avatar: {
		name: string;
		thumb: string;
		isAtlassianMastered: boolean;
	} | null;
	edited: boolean;
	user_id: string;
	anon_user_id: string | null;
	createdAt: string;
	isChatMessage: boolean;
	comment_post_id: string;
	extended_reaction: string | null;
}

interface VideoComment {
	id: string;
	content: string;
	plainContent: string;
	time_stamp: number | null;
	user_name: string;
	avatar: {
		name: string;
		thumb: string;
		isAtlassianMastered: boolean;
	} | null;
	edited: boolean;
	createdAt: string;
	isChatMessage: boolean;
	user_id: string;
	anon_user_id: string | null;
	deletedAt: string | null;
	children_comments: CommentReply[];
}

// Function to fetch comments from Loom API
async function fetchVideoComments(
	videoId: string,
): Promise<VideoComment[] | null> {
	try {
		const response = await fetch("https://www.loom.com/graphql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "loom-transcript-mcp/1.0.0",
			},
			body: JSON.stringify({
				operationName: "fetchVideoComments",
				variables: {
					id: videoId,
					password: null,
				},
				query: `query fetchVideoComments($id: ID!, $password: String) {
  video: getVideo(id: $id, password: $password) {
    __typename
    ... on RegularUserVideo {
      id
      videoMeetingPlatform
      video_comments(includeDeleted: true) {
        ...CommentPostFragment
        __typename
      }
      __typename
    }
  }
}

fragment CommentPostFragment on PublicVideoComment {
  id
  content(withMentionMarkups: true)
  plainContent: content(withMentionMarkups: false)
  time_stamp
  user_name
  avatar {
    name
    thumb
    isAtlassianMastered
    __typename
  }
  edited
  createdAt
  isChatMessage
  user_id
  anon_user_id
  deletedAt
  children_comments {
    ...CommentReplyFragment
    __typename
  }
  __typename
}

fragment CommentReplyFragment on PublicVideoComment {
  id
  content(withMentionMarkups: true)
  plainContent: content(withMentionMarkups: false)
  time_stamp
  user_name
  avatar {
    name
    thumb
    isAtlassianMastered
    __typename
  }
  edited
  user_id
  anon_user_id
  createdAt
  isChatMessage
  comment_post_id
  extended_reaction
  __typename
}`,
			}),
		});

		const data = (await response.json()) as {
			data?: {
				video?: {
					video_comments?: VideoComment[];
				};
			};
		};

		console.log("API Response:", JSON.stringify(data, null, 2));

		if (data?.data?.video?.video_comments) {
			return data.data.video.video_comments;
		}

		return null;
	} catch (error) {
		console.error("Error fetching video comments:", error);
		return null;
	}
}

// Create a fresh MCP server for each request (stateless, no Durable Object)
function createServer(): McpServer {
	const server = new McpServer({
		name: "loom-transcript",
		version: "1.0.0",
	});

	server.registerTool(
		"getLoomTranscript",
		{
			description:
				"Get transcript text, title, and description from a Loom video URL",
			inputSchema: {
				videoUrl: z
					.string()
					.describe(
						"The Loom video URL (e.g., https://www.loom.com/share/123456)",
					),
			},
		},
		async ({ videoUrl }) => {
			try {
				console.log("Processing video URL:", videoUrl);

				// Extract video ID from URL
				const videoId = extractVideoId(videoUrl);
				console.log("Extracted video ID:", videoId);

				if (!videoId) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: Could not extract video ID from the provided URL.",
							},
						],
					};
				}

				// Fetch video metadata and transcript URL in parallel
				const [metadata, captionsUrl] = await Promise.all([
					fetchVideoMetadata(videoId),
					fetchTranscriptUrl(videoId),
				]);

				console.log("Metadata:", metadata);
				console.log("Captions URL:", captionsUrl);

				if (!captionsUrl) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: Could not fetch transcript for this video.",
							},
						],
					};
				}

				// Fetch and parse VTT content
				const transcriptText = await fetchVttContent(captionsUrl);
				console.log("Transcript length:", transcriptText.length);

				// Build response with metadata and transcript
				let responseText = "";
				if (metadata) {
					responseText += `# ${metadata.title}\n\n`;
					if (metadata.description) {
						responseText += `**Description:** ${metadata.description}\n\n`;
					}
					responseText += `---\n\n## Transcript\n\n`;
				}
				responseText += transcriptText;

				return {
					content: [
						{
							type: "text" as const,
							text: responseText,
						},
					],
				};
			} catch (error) {
				console.error("Error in handler:", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Tool to get Loom comments
	server.registerTool(
		"getLoomComments",
		{
			description: "Get comments from a Loom video URL",
			inputSchema: {
				videoUrl: z
					.string()
					.describe(
						"The Loom video URL (e.g., https://www.loom.com/share/123456)",
					),
			},
		},
		async ({ videoUrl }) => {
			try {
				console.log("Processing video URL for comments:", videoUrl);

				// Extract video ID from URL
				const videoId = extractVideoId(videoUrl);
				console.log("Extracted video ID:", videoId);

				if (!videoId) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: Could not extract video ID from the provided URL.",
							},
						],
					};
				}

				// Fetch video comments
				const comments = await fetchVideoComments(videoId);
				console.log("Comments fetched:", comments);

				if (!comments) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: Could not fetch comments for this video.",
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(comments, null, 2),
						},
					],
				};
			} catch (error) {
				console.error("Error in comments handler:", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Tool to get Loom snapshot/thumbnail image
	server.registerTool(
		"getLoomSnapshot",
		{
			description:
				"Get a visual snapshot/thumbnail image from a Loom video. Returns the static thumbnail image so you can see what the video shows.",
			inputSchema: {
				videoUrl: z
					.string()
					.describe(
						"The Loom video URL (e.g., https://www.loom.com/share/123456)",
					),
			},
		},
		async ({ videoUrl }) => {
			try {
				console.log("Processing video URL for snapshot:", videoUrl);

				// Extract video ID from URL
				const videoId = extractVideoId(videoUrl);
				console.log("Extracted video ID:", videoId);

				if (!videoId) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: Could not extract video ID from the provided URL.",
							},
						],
					};
				}

				// Fetch video metadata to get thumbnail URLs
				const metadata = await fetchVideoMetadata(videoId);
				console.log("Metadata:", metadata);

				if (!metadata) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: Could not fetch video metadata.",
							},
						],
					};
				}

				const thumbnailUrl = metadata.thumbnails.staticUrl;
				if (!thumbnailUrl) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Error: No thumbnail available for this video.",
							},
						],
					};
				}

				// Fetch the thumbnail image
				console.log("Fetching thumbnail from:", thumbnailUrl);
				const imageResponse = await fetch(thumbnailUrl);

				if (!imageResponse.ok) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: Failed to fetch thumbnail image (${imageResponse.status})`,
							},
						],
					};
				}

				// Convert to base64
				const imageBuffer = await imageResponse.arrayBuffer();
				const base64Image = btoa(
					String.fromCharCode(...new Uint8Array(imageBuffer)),
				);

				// Determine mime type from URL
				const mimeType = thumbnailUrl.endsWith(".gif")
					? "image/gif"
					: "image/jpeg";

				return {
					content: [
						{
							type: "text" as const,
							text: `# ${metadata.title}\n\n${metadata.description ? `**Description:** ${metadata.description}\n\n` : ""}**Thumbnail URLs:**\n- Static: ${metadata.thumbnails.staticUrl}\n- Animated: ${metadata.thumbnails.animatedUrl}\n- With Play Button: ${metadata.thumbnails.withPlayUrl}`,
						},
						{
							type: "image" as const,
							data: base64Image,
							mimeType: mimeType,
						},
					],
				};
			} catch (error) {
				console.error("Error in snapshot handler:", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	return server;
}

const handleMcp = createMcpHandler(createServer, { route: "/mcp" });

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return new Response(
				"The /sse transport has been retired. Connect using streamable HTTP at /mcp instead.",
				{ status: 410 },
			);
		}

		if (url.pathname === "/mcp") {
			return handleMcp(request, env, ctx);
		}

		return new Response(
			"Loom Transcript MCP Server - Use the /mcp endpoint (streamable HTTP)",
			{ status: 200 },
		);
	},
};
