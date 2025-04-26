import OpenAI from 'openai';
import dotenv from 'dotenv';
import readline from 'readline';
import { initializeI18n, t, Language, changeLanguage } from './i18n';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Types for our system
interface AgentResponse {
  agent: 'triage' | 'dietetic' | 'psychotherapy';
  content: string;
  error?: string;
}

interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    specialist?: string;
  }>;
}

// Initialize conversation context
let conversationContext: ConversationContext = {
  messages: []
};

// Helper to format conversation history
function formatConversationHistory(): string {
  return conversationContext.messages
    .map(msg => {
      const role = msg.role === 'user' ? 'User' : msg.specialist || 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
}

// Add user context to message
function addUserContextToMessage(message: string): string {
  const userProfile = t('userContext.profile');
  const conversationHistory = formatConversationHistory();
  
  return `${userProfile}\n\nCONVERSATION HISTORY:\n${conversationHistory}\n\nCURRENT MESSAGE:\n${message}`;
}

// Console logging helper
function logStep(step: string, details: string) {
  console.log('\n🔄 ' + '='.repeat(20) + ' ' + step + ' ' + '='.repeat(20));
  console.log(details);
  if (step.includes('Response')) {
    const modelType = step.includes('Triage') ? 'triage' : 
                     step.includes('Dietetic') ? 'dietetic' : 'psychotherapy';
    console.log(`Using model: ${t(`models.${modelType}.name`)} - ${t(`models.${modelType}.description`)}`);
  }
  console.log('='.repeat(50) + '\n');
}

// Function definitions for assistants
const nutritionFunction = {
  name: "getNutritionalData",
  description: "Get nutritional information and recommendations",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Nutrition or diet-related query"
      },
      userContext: {
        type: "object",
        description: "User's medical and dietary context",
        properties: {
          weight: { type: "number" },
          height: { type: "number" },
          medicalHistory: { type: "string" }
        }
      }
    },
    required: ["query"]
  }
};

const therapyFunction = {
  name: "getTherapyResources",
  description: "Get therapy techniques and mental health resources",
  parameters: {
    type: "object",
    properties: {
      concern: {
        type: "string",
        description: "Mental health concern or emotional issue"
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "high", "emergency"],
        description: "Level of concern severity"
      }
    },
    required: ["concern"]
  }
};

// Create the triage assistant
async function createTriageAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({
      name: t('assistants.triage.name'),
      description: t('assistants.triage.description'),
      instructions: t('assistants.triage.instructions'),
      model: t('models.triage.name'),
      tools: [{ type: "code_interpreter" }],
      response_format: { type: "json_object" }
    });

    console.log(t('assistants.triage.created'));
    return assistant;
  } catch (error: any) {
    console.error(t('assistants.triage.error', { message: error.message }));
    throw error;
  }
}

// Create the dietetic specialist
async function createDieteticAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({
      name: t('assistants.dietetic.name'),
      description: t('assistants.dietetic.description'),
      instructions: t('assistants.dietetic.instructions'),
      model: t('models.dietetic.name'),
      tools: [
        { type: "code_interpreter" },
        { 
          type: "function",
          function: nutritionFunction
        }
      ]
    });

    console.log(t('assistants.dietetic.created'));
    return assistant;
  } catch (error: any) {
    console.error(t('assistants.dietetic.error', { message: error.message }));
    throw error;
  }
}

// Create the psychotherapy specialist
async function createPsychotherapyAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({
      name: t('assistants.psychotherapy.name'),
      description: t('assistants.psychotherapy.description'),
      instructions: t('assistants.psychotherapy.instructions'),
      model: t('models.psychotherapy.name'),
      tools: [
        { type: "code_interpreter" },
        { 
          type: "function",
          function: therapyFunction
        }
      ]
    });

    console.log(t('assistants.psychotherapy.created'));
    return assistant;
  } catch (error: any) {
    console.error(t('assistants.psychotherapy.error', { message: error.message }));
    throw error;
  }
}

async function createThread() {
  try {
    const thread = await openai.beta.threads.create();
    console.log('Thread created successfully!');
    return thread;
  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
}

async function addMessageToThread(threadId: string, content: string, role: string = "user") {
  try {
    const contextualizedContent = role === "user" ? addUserContextToMessage(content) : content;
    logStep("ADDING MESSAGE", `Role: ${role}\nContent: ${contextualizedContent}`);
    
    const message = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: contextualizedContent,
    });

    // Add to conversation context
    conversationContext.messages.push({
      role: role as 'user' | 'assistant',
      content: content,
      specialist: role === 'assistant' ? 'Triage' : undefined
    });

    return message;
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
}

async function runAssistant(assistantId: string, threadId: string, agentType: string) {
  try {
    logStep("RUNNING ASSISTANT", `Agent Type: ${agentType}\nThread ID: ${threadId}`);
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    return run;
  } catch (error) {
    console.error('Error starting run:', error);
    throw error;
  }
}

async function waitForRunCompletion(threadId: string, runId: string, agentType: string) {
  while (true) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    logStep("CHECKING RUN STATUS", `Agent Type: ${agentType}\nStatus: ${run.status}`);
    
    if (run.status === 'completed') {
      return run;
    } else if (run.status === 'failed') {
      throw new Error(`Run failed: ${run.last_error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function getMessages(threadId: string, agentType: string) {
  try {
    const messages = await openai.beta.threads.messages.list(threadId);
    if (messages.data[0]?.content[0]?.type === 'text') {
      logStep("RECEIVED MESSAGE", `Agent Type: ${agentType}\nContent: ${messages.data[0].content[0].text.value}`);
    }
    return messages;
  } catch (error) {
    console.error('Error retrieving messages:', error);
    throw error;
  }
}

function cleanResponse(response: string): string {
  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1];
  }
  return response;
}

async function processResponse(response: string): Promise<AgentResponse> {
  try {
    // Clean the response before parsing
    const cleanedResponse = cleanResponse(response);
    
    // First try to parse as JSON
    const parsed = JSON.parse(cleanedResponse);
    
    // Validate the response structure
    if (!parsed.agent || !parsed.content) {
      throw new Error('Invalid response structure');
    }
    
    // Validate agent type
    if (!['triage', 'dietetic', 'psychotherapy'].includes(parsed.agent)) {
      throw new Error('Invalid agent type');
    }
    
    logStep("PROCESSING RESPONSE", `Agent: ${parsed.agent}\nContent: ${parsed.content}`);
    return parsed as AgentResponse;
  } catch (error: any) {
    logStep("PROCESSING ERROR", `Error parsing response: ${error.message}\nRaw response: ${response}`);
    // Extract content from markdown code block if possible
    const content = cleanResponse(response);
    try {
      // Try to parse the cleaned content as JSON to extract just the content field
      const parsed = JSON.parse(content);
      return {
        agent: 'triage',
        content: parsed.content || content,
        error: error.message
      };
    } catch {
      // If all else fails, return the raw response
      return {
        agent: 'triage',
        content: 'I apologize, but I encountered an error understanding the response. Please try rephrasing your question.',
        error: error.message
      };
    }
  }
}

async function handleSpecialistResponse(
  threadId: string,
  specialistAssistant: any,
  specialistType: 'dietetic' | 'psychotherapy',
  userMessage: string
): Promise<string> {
  // Send to specialist with full context
  const specialistRun = await runAssistant(specialistAssistant.id, threadId, specialistType);
  await waitForRunCompletion(threadId, specialistRun.id, specialistType);
  
  const specialistMessages = await getMessages(threadId, specialistType);
  const specialistResponse = specialistMessages.data[0];
  
  if (!specialistResponse || specialistResponse.content[0].type !== 'text') {
    throw new Error(t('errors.invalidFormat'));
  }

  const specialistContent = specialistResponse.content[0].text.value;
  
  // Add specialist response to context
  conversationContext.messages.push({
    role: 'assistant',
    content: specialistContent,
    specialist: specialistType === 'dietetic' ? 'Dietetic Specialist' : 'Psychotherapy Specialist'
  });

  // Send specialist response back through triage for awareness
  const triageContext = `Previous user message: "${userMessage}"\nSpecialist (${specialistType}) response: "${specialistContent}"\nPlease acknowledge this interaction and maintain conversation awareness.`;
  await addMessageToThread(threadId, triageContext, 'system');

  return specialistContent;
}

// Audio recording and processing
interface AudioConfig {
  sampleRate: number;
  format: string;
  channels: number;
  outputDir: string;
}

const audioConfig: AudioConfig = {
  sampleRate: 16000,
  format: 'wav',
  channels: 1,
  outputDir: path.join(process.cwd(), 'temp')
};

// Ensure temp directory exists
if (!fs.existsSync(audioConfig.outputDir)) {
  fs.mkdirSync(audioConfig.outputDir, { recursive: true });
}

async function recordAudio(): Promise<string> {
  const timestamp = Date.now();
  const outputFile = path.join(audioConfig.outputDir, `recording_${timestamp}.wav`);
  
  console.log(t('input.voice.start'));
  
  return new Promise((resolve, reject) => {
    const rec = spawn('rec', [
      '-t', 'wav',
      '-r', audioConfig.sampleRate.toString(),
      '-c', audioConfig.channels.toString(),
      outputFile,
      'silence', '1', '0.1', '3%', '1', '3.0', '3%'
    ]);

    rec.stderr.on('data', (data: Buffer) => {
      const errorMessage = data.toString();
      if (errorMessage.includes('Input Overload')) {
        console.log('⚠️  Speaking too loud!');
      } else {
        console.error('Recording error:', errorMessage);
      }
    });

    rec.on('close', (code: number) => {
      if (code === 0) {
        // Verify file exists and has content
        if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
          resolve(outputFile);
        } else {
          reject(new Error('Recording file is empty or was not created properly.'));
        }
      } else {
        reject(new Error(`Recording failed with code ${code}. Please check if your microphone is properly connected and has necessary permissions.`));
      }
    });

    // Handle Ctrl+C to stop recording
    process.on('SIGINT', () => {
      rec.kill();
    });
  });
}

async function transcribeAudio(audioFile: string, language: Language): Promise<string> {
  console.log(t('input.voice.processing'));
  
  try {
    // Verify file exists and has content before sending
    if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) {
      throw new Error('Audio file is empty or does not exist');
    }

    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile),
      model: t('models.stt.name'),
      language: t('models.stt.language'),
      prompt: t('models.stt.prompt'),
      response_format: 'text'
    });

    // Clean up the audio file
    fs.unlinkSync(audioFile);
    
    return response;
  } catch (error: any) {
    console.error(t('input.voice.error', { message: error.message }));
    // Clean up the audio file even if transcription fails
    if (fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
    return '';
  }
}

type InputMode = 'text' | 'voice';

async function getUserInput(mode: InputMode, language: Language): Promise<string> {
  if (mode === 'voice') {
    try {
      const audioFile = await recordAudio();
      const transcription = await transcribeAudio(audioFile, language);
      
      if (!transcription) {
        console.log(t('input.voice.noInput'));
        return '';
      }
      
      console.log(`You (voice): ${transcription}`);
      return transcription;
    } catch (error: any) {
      console.error(t('input.voice.error', { message: error.message }));
      return '';
    }
  } else {
    return new Promise<string>(resolve => {
      rl.question(t('prompts.user'), resolve);
    });
  }
}

async function playAudioResponse(text: string, language: Language): Promise<void> {
  try {
    const timestamp = Date.now();
    const outputFile = path.join(audioConfig.outputDir, `response_${timestamp}.mp3`);
    
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: language === 'pl' ? "nova" : "alloy", // Wybieramy głos w zależności od języka
      input: text,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputFile, buffer);

    // Odtwarzamy plik audio
    const play = spawn('afplay', [outputFile]);
    
    return new Promise((resolve, reject) => {
      play.on('close', (code: number) => {
        // Usuwamy plik po odtworzeniu
        fs.unlinkSync(outputFile);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Audio playback failed with code ${code}`));
        }
      });
    });
  } catch (error: any) {
    console.error('Error playing audio response:', error.message);
  }
}

async function chat(language: Language = 'en') {
  try {
    // Initialize i18n
    await initializeI18n(language);
    
    logStep(t('logs.initialization'), "");
    
    // Create all assistants
    const triageAssistant = await createTriageAssistant();
    const dieteticAssistant = await createDieteticAssistant();
    const psychotherapyAssistant = await createPsychotherapyAssistant();
    
    // Create single thread for the entire conversation
    const conversationThread = await createThread();
    
    // Initialize conversation with user context
    await addMessageToThread(
      conversationThread.id,
      t('userContext.profile'),
      'system'
    );
    
    logStep(t('logs.setup'), `
Conversation Thread ID: ${conversationThread.id}
Triage Assistant ID: ${triageAssistant.id}
Dietetic Assistant ID: ${dieteticAssistant.id}
Psychotherapy Assistant ID: ${psychotherapyAssistant.id}
    `);
    
    console.log('\n' + t('welcome.title'));
    console.log(t('welcome.description'));
    console.log(t('welcome.exit') + '\n');

    // Choose input mode once at the beginning
    let inputMode: InputMode = 'text';
    const modeSwitch = await new Promise<string>(resolve => {
      rl.question(t('input.type.switch'), resolve);
    });

    if (modeSwitch.toLowerCase() === 'v') {
      inputMode = 'voice';
      console.log(t('input.type.voice'));
    } else {
      inputMode = 'text';
      console.log(t('input.type.text'));
    }

    let retryCount = 0;
    const MAX_RETRIES = 3;

    while (true) {
      try {
        const userInput = await getUserInput(inputMode, language);

        if (!userInput) {
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            console.log('\nPrzekroczono maksymalną liczbę prób. Kończę rozmowę.');
            break;
          }
          console.log(`\nPozostało prób: ${MAX_RETRIES - retryCount}`);
          continue;
        }

        if (userInput.toLowerCase() === 'exit') {
          logStep(t('logs.conversationEnd'), "User requested exit");
          break;
        }

        if (!userInput.trim()) {
          console.log(t('errors.emptyInput'));
          continue;
        }

        // Reset retry count on successful input
        retryCount = 0;

        logStep(t('logs.userInput'), userInput);

        // Add user message to conversation thread
        await addMessageToThread(conversationThread.id, userInput);
        
        // Get triage assessment
        const triageRun = await runAssistant(triageAssistant.id, conversationThread.id, "triage");
        await waitForRunCompletion(conversationThread.id, triageRun.id, "triage");
        
        const triageMessages = await getMessages(conversationThread.id, "triage");
        const triageResponse = triageMessages.data[0];
        
        if (!triageResponse || triageResponse.content[0].type !== 'text') {
          throw new Error(t('errors.invalidFormat'));
        }

        const response = await processResponse(triageResponse.content[0].text.value);
        
        // Route to appropriate specialist if needed
        if (response.agent === 'dietetic' || response.agent === 'psychotherapy') {
          logStep(t('logs.routing', { specialist: response.agent }), "");
          
          const specialistAssistant = response.agent === 'dietetic' ? dieteticAssistant : psychotherapyAssistant;
          const specialistContent = await handleSpecialistResponse(
            conversationThread.id,
            specialistAssistant,
            response.agent,
            userInput
          );

          logStep(t('logs.specialistResponse'), specialistContent);
          console.log('\nAssistant:', specialistContent);
          
          // Play audio response if in voice mode
          if (inputMode === 'voice') {
            await playAudioResponse(specialistContent, language);
          }
        } else {
          // Add triage response to context
          conversationContext.messages.push({
            role: 'assistant',
            content: response.content,
            specialist: 'Triage'
          });

          logStep(t('logs.triageResponse'), response.content);
          console.log('\nAssistant:', response.content);
          
          // Play audio response if in voice mode
          if (inputMode === 'voice') {
            await playAudioResponse(response.content, language);
          }
        }
      } catch (error: any) {
        console.error('\n' + t('errors.processing'));
        console.log('\nAssistant:', t('errors.parseError'));
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          console.log('\nPrzekroczono maksymalną liczbę prób. Kończę rozmowę.');
          break;
        }
        console.log(`\nPozostało prób: ${MAX_RETRIES - retryCount}`);
        continue;
      }
      
      console.log('\n');
    }

    rl.close();
  } catch (error: any) {
    console.error(t('errors.fatal', { message: error.message }));
    rl.close();
  }
}

// Allow language selection from command line
const language = process.argv[2] as Language || 'en';
chat(language).catch(console.error); 