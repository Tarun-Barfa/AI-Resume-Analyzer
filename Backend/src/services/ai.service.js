const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium").default;



const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

// T:\GenAI\Backend\src\services\ai.service.js

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

   const prompt = `
Generate an interview report.

CRITICAL: Return EXACTLY this JSON structure with objects in ALL arrays (NOT strings):

{
  "title": "Job Title",
  "matchScore": 75,
  "technicalQuestions": [
    { "question": "Question text?", "intention": "Why ask this?", "answer": "How to answer" }
  ],
  "behavioralQuestions": [
    { "question": "Question text?", "intention": "Why ask this?", "answer": "How to answer" }
  ],
  "skillGaps": [
    { "skill": "Missing skill", "severity": "low" }
  ],
  "preparationPlan": [
    { "day": 1, "focus": "Focus area", "tasks": ["Task 1", "Task 2"] }
  ]
}

IMPORTANT RULES:
- EVERY array item MUST be an OBJECT with all required fields
- NEVER use plain strings like "Question text?" in arrays
- matchScore must be a number (0-100)
- severity must be "low", "medium", or "high"
- day must be a number starting from 1

Resume: ${resume}
Self Description: ${selfDescription}
Job Description: ${jobDescription}
`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",  // Keep this
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            // Remove responseSchema - it's not working with lite
        }
    })

    const data = JSON.parse(response.text);

    // TRANSFORM STRINGS TO OBJECTS (fixes the Mongoose error)
    const transformQuestion = (q) => {
        if (typeof q === 'string') {
            return { question: q, intention: 'Assess technical knowledge', answer: 'Discuss relevant concepts and provide examples' }
        }
        return { 
            question: q.question || 'Unknown question', 
            intention: q.intention || 'Assess knowledge', 
            answer: q.answer || 'Provide detailed explanation' 
        }
    }

    const transformSkillGap = (gap) => {
        if (typeof gap === 'string') {
            return { skill: gap, severity: 'medium' }
        }
        return { 
            skill: gap.skill || 'Unknown skill', 
            severity: gap.severity || 'medium' 
        }
    }

    const transformPlanItem = (item) => {
        if (typeof item === 'string') {
            return { day: 1, focus: item, tasks: ['Study this topic thoroughly'] }
        }
        return { 
            day: item.day || 1, 
            focus: item.focus || 'Unknown focus', 
            tasks: item.tasks || ['Complete study'] 
        }
    }

    // Apply transformations to fix schema mismatch
    const validatedData = {
        title: data.title || "Interview Report",
        matchScore: typeof data.matchScore === 'number' ? data.matchScore : 50,
        technicalQuestions: data.technicalQuestions?.map(transformQuestion) || [],
        behavioralQuestions: data.behavioralQuestions?.map(transformQuestion) || [],
        skillGaps: data.skillGaps?.map(transformSkillGap) || [],
        preparationPlan: data.preparationPlan?.map(transformPlanItem) || [],
    }

    return validatedData
}



// async function generatePdfFromHtml(htmlContent) {
//   let browser;
 
//   try {
//     browser = await puppeteer.launch({
//       headless: true,
//       args: [
//         '--no-sandbox',
//         '--disable-dev-shm-usage',
//         '--disable-gpu',
//         '--disable-setuid-sandbox'
//       ],
//       timeout: 60000
//     });
    
//     const page = await browser.newPage();
//     await page.setContent(htmlContent, { waitUntil: "networkidle" });
    
//     const pdfBuffer = await page.pdf({
//       format: "A4",
//       margin: {
//         top: "20mm",
//         bottom: "20mm",
//         left: "15mm",
//         right: "15mm"
//       }
//     });
    
//     return pdfBuffer;
//   } finally {
//     if (browser) {
//       await browser.close();
//     }
//   }
// }


async function generatePdfFromHtml(htmlContent) {

    console.log(typeof chromium.executablePath);
    console.log(chromium);

    const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
    });

    const page = await browser.newPage();

    await page.setContent(htmlContent, {
        waitUntil: "networkidle0"
    });

    const pdfBuffer = await page.pdf({
        format: "A4",
        margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    });

    await browser.close();

    return pdfBuffer;
}


async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
      //model: "gemini-2.5-flash-lite",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema),
        }
    })


    const jsonContent = JSON.parse(response.text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf }