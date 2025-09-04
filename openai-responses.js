const https = require('https');

class OpenAIResponsesAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.endpoint = 'api.openai.com';
        
        // Models that support web_search according to the documentation
        this.webSearchModels = [
            'gpt-4o-mini',
            'gpt-4o',
            'gpt-4.1-mini',
            'gpt-4.1',
            'o4-mini',
            'o3',
            'gpt-5'
        ];
    }

    /**
     * Check if a model supports web search
     */
    supportsWebSearch(model) {
        return this.webSearchModels.some(m => model.includes(m));
    }

    /**
     * Create a response with web search using the Responses API
     */
    async createResponseWithWebSearch(query, options = {}) {
        return new Promise((resolve, reject) => {
            // Default to gpt-4o-mini which supports web search
            const model = options.model || 'gpt-4o-mini';
            
            // Check if model supports web search
            if (!this.supportsWebSearch(model)) {
                console.warn(`Model ${model} may not support web_search. Trying anyway...`);
            }

            const requestBody = {
                model: model,
                input: query,
                tools: [
                    { type: "web_search" }
                ]
            };

            // Add optional parameters
            if (options.temperature !== undefined) {
                requestBody.temperature = options.temperature;
            }
            if (options.max_tokens) {
                requestBody.max_tokens = options.max_tokens;
            }

            const data = JSON.stringify(requestBody);

            const requestOptions = {
                hostname: this.endpoint,
                port: 443,
                path: '/v1/responses',  // Using the Responses API endpoint
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(requestOptions, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    console.log('Responses API Status:', res.statusCode);
                    console.log('Responses API Raw Response:', responseData.substring(0, 500));
                    
                    try {
                        const parsed = JSON.parse(responseData);
                        
                        if (parsed.error) {
                            console.error('Responses API Error:', parsed.error);
                            
                            // Check if it's a model not found error - might need to use different model
                            if (parsed.error.code === 'model_not_found' || parsed.error.message?.includes('model')) {
                                console.log('Model not supported for Responses API, try gpt-4o or gpt-4o-mini');
                            }
                            
                            resolve({
                                success: false,
                                error: parsed.error.message || 'API error',
                                details: parsed.error,
                                statusCode: res.statusCode
                            });
                            return;
                        }

                        // Log the parsed response for debugging
                        console.log('Parsed Responses API output:', JSON.stringify(parsed, null, 2).substring(0, 1000));

                        // Parse the response according to the documentation format
                        const result = this.parseResponsesAPIOutput(parsed);
                        resolve({
                            success: true,
                            ...result,
                            debugInfo: {
                                statusCode: res.statusCode,
                                hasContent: !!result.content,
                                citationCount: result.citations.length,
                                rawResponseLength: responseData.length
                            }
                        });
                        
                    } catch (error) {
                        console.error('Error parsing response:', error);
                        console.error('Raw response that failed to parse:', responseData);
                        resolve({
                            success: false,
                            error: 'Failed to parse response',
                            rawResponse: responseData.substring(0, 1000),
                            statusCode: res.statusCode
                        });
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Request error:', error);
                resolve({
                    success: false,
                    error: error.message
                });
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Parse the Responses API output format
     */
    parseResponsesAPIOutput(apiResponse) {
        const result = {
            content: '',
            citations: [],
            webSearchCalls: [],
            rawResponse: apiResponse
        };

        // Handle array response format as shown in documentation
        if (Array.isArray(apiResponse)) {
            for (const item of apiResponse) {
                if (item.type === 'web_search_call') {
                    result.webSearchCalls.push({
                        id: item.id,
                        status: item.status,
                        action: item.action || 'search'
                    });
                } else if (item.type === 'message') {
                    // Extract the main content
                    if (item.content && item.content[0]) {
                        if (item.content[0].type === 'output_text') {
                            result.content = item.content[0].text;
                            
                            // Extract citations
                            if (item.content[0].annotations) {
                                result.citations = item.content[0].annotations
                                    .filter(a => a.type === 'url_citation')
                                    .map(a => ({
                                        url: a.url,
                                        title: a.title,
                                        startIndex: a.start_index,
                                        endIndex: a.end_index
                                    }));
                            }
                        } else if (item.content[0].text) {
                            result.content = item.content[0].text;
                        }
                    }
                }
            }
        } 
        // Handle object response format (alternative format)
        else if (apiResponse.output_text) {
            result.content = apiResponse.output_text;
            
            if (apiResponse.annotations) {
                result.citations = apiResponse.annotations
                    .filter(a => a.type === 'url_citation')
                    .map(a => ({
                        url: a.url,
                        title: a.title,
                        startIndex: a.start_index,
                        endIndex: a.end_index
                    }));
            }
        }
        // Fallback for standard chat completion format
        else if (apiResponse.choices && apiResponse.choices[0]) {
            const choice = apiResponse.choices[0];
            if (choice.message) {
                result.content = choice.message.content || '';
            }
        }

        return result;
    }

    /**
     * Format the response with inline citations
     */
    formatResponseWithCitations(content, citations) {
        if (!citations || citations.length === 0) {
            return content;
        }

        // Create a map of citations by their position
        const citationMap = new Map();
        citations.forEach((citation, index) => {
            const num = index + 1;
            citationMap.set(citation.startIndex, {
                ...citation,
                number: num
            });
        });

        // Sort citations by start index in reverse order to insert from end to beginning
        const sortedCitations = Array.from(citationMap.entries())
            .sort((a, b) => b[0] - a[0]);

        let formattedContent = content;
        
        // Insert citation markers
        sortedCitations.forEach(([startIndex, citation]) => {
            const beforeText = formattedContent.substring(0, citation.endIndex);
            const afterText = formattedContent.substring(citation.endIndex);
            formattedContent = beforeText + `[${citation.number}]` + afterText;
        });

        // Add sources section
        const sourcesSection = '\n\n**Sources:**\n' + citations.map((citation, index) => {
            const num = index + 1;
            return `[${num}] ${citation.title || 'Source'} - ${citation.url}`;
        }).join('\n');

        return formattedContent + sourcesSection;
    }
}

module.exports = OpenAIResponsesAPI;