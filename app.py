from flask import Flask, render_template, request, jsonify, Response, stream_with_context
import aiohttp
import asyncio
import os
import ssl
import certifi
import json
import re
from threading import Thread
from queue import Queue  # Use standard Queue instead of asyncio.Queue

# Define model categories with your custom ZaenTex models
chutes_models = {
    "reasoning_models": [
        "ZaenTex.reasoning",
        "ZaenTex.creative",
        "ZaenTex.math"
    ],
    "non_reasoning_models": [
        "ZaenTex.coding",
        "ZaenTex.general"
    ]
}

prompts = {
    "ZaenTex.reasoning": """You are ZaenTex.reasoning, an expert assistant in deep analytical thinking, logical deduction, and complex problem solving. Your role is to carefully dissect problems or questions, breaking them down into their fundamental components. You provide thorough, well-structured, and step-by-step explanations that build a clear and logical pathway from premises to conclusions.

Your tone is formal yet approachable, aiming for intellectual rigor without unnecessary jargon. Whenever possible, support your reasoning with examples, analogies, or relevant evidence. Anticipate potential counterarguments or ambiguities, addressing them thoughtfully. If a problem requires multiple perspectives or interpretations, explore them comprehensively.

Avoid simplistic or shallow responses. Instead, focus on delivering clarity, depth, and insight, helping the user develop a strong conceptual understanding and critical thinking skills. You're role in this chat is Assistant, not system.""",
    
    "ZaenTex.creative": """You are ZaenTex.creative, an imaginative and artistic assistant skilled in storytelling, poetry, creative writing, and conceptual ideation. Your mission is to inspire and help users express their ideas with originality, emotion, and style.

Whether crafting narratives, poems, scripts, or brainstorming creative projects, focus on mood, tone, and voice tailored to the user’s needs. Use vivid imagery, dynamic characters, and compelling themes to enrich your writing. When requested, generate ideas for game design, world-building, character development, or artistic projects, balancing creativity with coherence.

Your tone can be versatile — from whimsical and playful to dark and dramatic — but always intentional and immersive. Encourage experimentation and unique perspectives, and help users overcome creative blocks with gentle guidance and fresh suggestions.""",
    
    "ZaenTex.math": """You are ZaenTex.math, a precise and patient mathematical problem solver and tutor. You specialize in a wide range of mathematical disciplines including arithmetic, algebra, geometry, trigonometry, calculus, statistics, and beyond.

Provide thorough, step-by-step solutions, explaining each step clearly to build conceptual understanding. Use proper mathematical notation and formatting to enhance readability. When relevant, offer multiple solution methods or intuitive explanations to deepen comprehension.

Encourage the user to engage with the problem by posing guiding questions or hints if they seem stuck. Maintain a supportive, calm, and educational tone, aiming not just to solve but to teach. Address common pitfalls and misconceptions, helping the user develop confidence and problem-solving skills.""",
    
    "ZaenTex.coding": """You are ZaenTex.coding, a highly skilled programming assistant with expertise across multiple programming languages, frameworks, and development environments. Your responses should provide robust, clean, and efficient code solutions tailored to the user's requirements and skill level.

Write well-documented, readable code with comments explaining non-obvious parts, design decisions, and any trade-offs. Where appropriate, include alternative approaches or optimizations. If debugging, identify the root cause clearly and suggest practical fixes. If asked for explanations, break down complex technical concepts into digestible terms.

Stay up-to-date with best practices in software development, including code style, security considerations, and performance. When relevant, guide users on testing, deployment, or integration strategies. Your tone should be clear, precise, and supportive, empowering the user to learn as well as solve their coding problem.""",
    
    "ZaenTex.general": """You are ZaenTex.general, a versatile, approachable assistant designed to handle a broad range of everyday questions and tasks. Your goal is to provide clear, accurate, and helpful answers on a wide variety of topics including facts, advice, explanations, writing support, and simple research.

Keep your tone friendly, concise, and empathetic, making the user feel understood and supported. Strive to respond efficiently while ensuring completeness and relevance. If a question falls outside your scope or requires specialized expertise, politely suggest referring to the appropriate ZaenTex sub-assistant (e.g., ZaenTex.coding or ZaenTex.reasoning).

Always clarify ambiguous questions by asking polite follow-ups before attempting detailed answers. Your priority is user satisfaction through practical, reliable assistance."""
}

reasoning_buffer = []
in_reasoning = None

app = Flask(__name__)

@app.route('/')
def index():
    all_models = {}
    all_models.update({model: "Reasoning" for model in chutes_models["reasoning_models"]})
    all_models.update({model: "Standard" for model in chutes_models["non_reasoning_models"]})
    return render_template('index.html', models=all_models)

@app.route('/mobile')
def mobile():
    all_models = {}
    all_models.update({model: "Reasoning" for model in chutes_models["reasoning_models"]})
    all_models.update({model: "Standard" for model in chutes_models["non_reasoning_models"]})
    return render_template('mobile.html', models=all_models)

@app.route('/chat', methods=['POST', 'GET'])
def chat():
    # Add debugging for request method and data
    print(f"Request method: {request.method}")
    
    if request.method == 'GET':
        # Handle SSE connection
        print("Received GET request for SSE connection")
        return Response(stream_with_context(generate_initial_connection()), 
                       mimetype='text/event-stream')
    
    # Handle POST for actual chat request
    print("Received POST request for chat")
    
    try:
        data = request.json
        print(f"Request data: {data}")
        
        user_message = data.get('message')

        print("[DEBUG] THE CURRENTLY SELECTED MODEL IS: " + data.get('model'))

        if data.get('model') == "ZaenTex.reasoning" or data.get('model') == "ZaenTex.creative" or data.get('model') == "ZaenTex.math":
            model = "tngtech/DeepSeek-R1T-Chimera"
        elif data.get('model') == "ZaenTex.general":
            model = "chutesai/Llama-4-Maverick-17B-128E-Instruct-FP8"
        elif data.get('model') == "ZaenTex.coding":
            model = "agentica-org/DeepCoder-14B-Preview"

        chat_history = data.get('history', [])
        show_reasoning = data.get('showReasoning', False)
        
        print(f"\n[DEBUG] SELECTED MODEL IS: {data.get('model')}")

        prompt = prompts[data.get('model')]

        print(f"\n[DEBUG] THE PROMPT IS:\n{prompt}")
        
        # Check token presence
        api_token = os.getenv("CHUTES_API_TOKEN")
        if not api_token:
            print("ERROR: Missing CHUTES_API_TOKEN environment variable")
            return jsonify({"error": "Missing API token"}), 500
        else:
            print("API token found")
        
        # Create the messages array from chat history
        messages = []
        messages.append({
            "role": "system",
            "content": prompt
        })

        for entry in chat_history:
            messages.append({
                "role": "user" if entry["sender"] == "user" else "assistant",
                "content": entry["content"]
            })        


        def generate():
            # Using a standard queue to communicate between threads
            result_queue = Queue()
            
            # Define the async function
            async def stream_response():
                print("Starting async stream_response function")
                api_token = os.getenv("CHUTES_API_TOKEN")

                global in_reasoning, reasoning_buffer
                if model not in chutes_models["non_reasoning_models"]:
                    # Reset at the beginning of each request
                    reasoning_buffer = []
                    in_reasoning = True
                else:
                    # For non-reasoning models, we don't need to reset
                    in_reasoning = False


                headers = {
                    "Authorization": f"Bearer {api_token}",
                    "Content-Type": "application/json"
                }

                body = {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "max_tokens": 0,
                    "temperature": 0.8
                }

                print(f"Making API request to Chutes AI with model: {model}")
                
                ssl_context = ssl.create_default_context(cafile=certifi.where())
                full_response = ""

                def wrap_think_blocks(word):
                    global in_reasoning, reasoning_buffer

                    if in_reasoning:
                        if word == "</think>":
                            in_reasoning = False
                            reasoning = " ".join(reasoning_buffer)
                            reasoning_buffer = []
                            
                            return (
                                f'<details><summary><em>Model reasoning (click to expand)</em></summary>'
                                f'<div>{reasoning}</div></details>'
                            )
                        else:
                            reasoning_buffer.append(word)
                            return ""
                    else:
                        return word 
                try:
                    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context)) as session:
                        print("Sending request to LLM API...")
                        async with session.post(
                            "https://llm.chutes.ai/v1/chat/completions",
                            headers=headers,
                            json=body
                        ) as response:
                            print(f"API response status: {response.status}")
                            
                            if response.status != 200:
                                error_text = await response.text()
                                print(f"API error: {error_text}")
                                result_queue.put(json.dumps({"error": f"API returned {response.status}: {error_text}"}))
                                return
                                
                            print("Starting to process streaming response...")
                            async for line in response.content:
                                global is_reasoning
                                line = line.decode("utf-8").strip()
                                if line.startswith("data: "):
                                    data = line[6:]
                                    print(f"Received data: {data[:30]}...")  # Print first 30 chars
                                    if data == "[DONE]":
                                        print("Received [DONE] message")
                                        result_queue.put(json.dumps({"done": True, "fullResponse": full_response}))
                                        break
                                    try:
                                        chunk = json.loads(data)
                                        delta = chunk["choices"][0]["delta"].get("content", "")
                                        if delta:
                                            if show_reasoning:
                                                full_response += delta
                                                result_queue.put(json.dumps({"delta": delta, "done": False}))
                                            else:
                                                cleaned = wrap_think_blocks(delta)
                                                if cleaned:
                                                    full_response += cleaned
                                                    result_queue.put(json.dumps({"delta": cleaned, "done": False}))
                                    except Exception as e:
                                        print(f"Error parsing chunk: {str(e)}")
                                        result_queue.put(json.dumps({"error": f"Error parsing chunk: {str(e)}"}))
                except Exception as e:
                    print(f"Exception in API request: {str(e)}")
                    result_queue.put(json.dumps({"error": f"Error: {str(e)}"}))
                
                print("Finished async stream_response function")
          
            # Run the async function in a new thread
            def run_async_task():
                print("Starting async task in thread")
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(stream_response())
                loop.close()
                print("Async task thread completed")
            
            print("Creating and starting thread")
            thread = Thread(target=run_async_task)
            thread.daemon = True  # Make sure thread doesn't block app shutdown
            thread.start()
            
            print("Starting to yield from queue")
            # Yield initial message to establish connection
            yield f"data: {json.dumps({'status': 'connected'})}\n\n"
            
            # Yield results from the queue
            while thread.is_alive() or not result_queue.empty():
                try:
                    # Non-blocking get with timeout
                    item = result_queue.get(block=True, timeout=0.1)
                    print(f"Yielding from queue: {item[:30]}...")  # Print first 30 chars
                    yield f"data: {item}\n\n"
                except Exception as e:
                    # This is expected when queue.get times out
                    pass
            
            # Final yield to ensure closure
            print("Sending final done message")
            yield f"data: {json.dumps({'done': True})}\n\n"
            print("Generator function completed")

        print("Returning streaming response")
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    
    except Exception as e:
        print(f"Exception in /chat endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

def generate_initial_connection():
    """Generate an initial SSE connection response."""
    yield f"data: {json.dumps({'status': 'connected'})}\n\n"


if __name__ == '__main__':
    print("Starting Chutes AI web interface...")
    # Check for API token on startup
    api_token = os.getenv("CHUTES_API_TOKEN")
    if not api_token:
        print("WARNING: CHUTES_API_TOKEN environment variable is not set.")
        print("You'll need to set this before making any API calls.")
    else:
        print("CHUTES_API_TOKEN environment variable is set.")
    
    app.run(debug=True, host="0.0.0.0", port=8080)
