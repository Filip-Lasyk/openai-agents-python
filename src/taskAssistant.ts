import OpenAI from 'openai';
import dotenv from 'dotenv';
import readline from 'readline';

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

// Define types for our task management system
interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  assignedTo?: string;
}

interface TaskResponse {
  tasks: Task[];
  message: string;
}

async function createAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({
      name: "Task Manager",
      description: "An AI assistant that helps manage and track tasks",
      instructions: `You are a task management assistant. Your role is to:
1. Create, update, and delete tasks
2. Track task status and progress
3. Assign tasks to team members
4. Set priorities and due dates
5. Provide task summaries and reports
6. Help with task organization and planning

When responding to task-related queries:
- Always maintain a structured format
- Include relevant task details
- Provide clear status updates
- Suggest next steps when appropriate
- Keep track of task dependencies
- Ensure all task data is properly formatted`,
      model: "gpt-4o-mini",
      tools: [{ type: "code_interpreter" }]
    });

    console.log('Assistant created successfully!');
    return assistant;
  } catch (error) {
    console.error('Error creating assistant:', error);
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

async function addMessageToThread(threadId: string, content: string) {
  try {
    const message = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: content,
    });
    return message;
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
}

async function runAssistant(assistantId: string, threadId: string) {
  try {
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    return run;
  } catch (error) {
    console.error('Error starting run:', error);
    throw error;
  }
}

async function waitForRunCompletion(threadId: string, runId: string) {
  while (true) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    if (run.status === 'completed') {
      return run;
    } else if (run.status === 'failed') {
      throw new Error(`Run failed: ${run.last_error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function getMessages(threadId: string) {
  try {
    const messages = await openai.beta.threads.messages.list(threadId);
    return messages;
  } catch (error) {
    console.error('Error retrieving messages:', error);
    throw error;
  }
}

async function chat() {
  try {
    // Create assistant and thread
    const assistant = await createAssistant();
    const thread = await createThread();
    
    console.log('\nWelcome to the Task Management Assistant!');
    console.log('Type "exit" to end the conversation.\n');

    while (true) {
      // Get user input
      const userInput = await new Promise<string>(resolve => {
        rl.question('You: ', resolve);
      });

      if (userInput.toLowerCase() === 'exit') {
        break;
      }

      // Add user message to thread
      await addMessageToThread(thread.id, userInput);

      // Run assistant
      const run = await runAssistant(assistant.id, thread.id);

      // Wait for run to complete
      await waitForRunCompletion(thread.id, run.id);

      // Get messages
      const messages = await getMessages(thread.id);
      const assistantMessage = messages.data[0];
      
      if (assistantMessage && assistantMessage.content[0].type === 'text') {
        console.log('\nAssistant:', assistantMessage.content[0].text.value);
      }
      console.log('\n');
    }

    rl.close();
  } catch (error) {
    console.error('Error in chat:', error);
    rl.close();
  }
}

// Run the chat function
chat().catch(console.error); 