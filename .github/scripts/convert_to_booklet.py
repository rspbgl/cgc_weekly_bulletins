import os
import glob
import math
from pypdf import PdfReader, PdfWriter, PageObject, Transformation

def create_booklet(input_pdf_path, output_pdf_path):
    reader = PdfReader(input_pdf_path)
    num_pages = len(reader.pages)
    
    # Booklet page counts must be multiples of 4
    total_pages = math.ceil(num_pages / 4) * 4
    
    # Store original pages or None for padded blank pages
    pages = [reader.pages[i] if i < num_pages else None for i in range(total_pages)]
    
    writer = PdfWriter()
    
    # Standard A4 size in points (Portrait: 595.28 x 841.89, Landscape: 1190.55 x 841.89)
    # Each half on the landscape sheet is 595.28 x 841.89
    page_width = 595.28
    page_height = 841.89
    landscape_width = page_width * 2
    landscape_height = page_height
    
    sheets = total_pages // 4
    
    for i in range(sheets):
        # Determine 4 pages for this sheet (Front & Back)
        # Sheet Front: [Back Page, Front Page] -> e.g., Page 4, Page 1
        # Sheet Back:  [Inside Left, Inside Right] -> e.g., Page 2, Page 3
        p_front_left = pages[total_pages - 1 - (2 * i)]
        p_front_right = pages[2 * i]
        
        p_back_left = pages[2 * i + 1]
        p_back_right = pages[total_pages - 2 - (2 * i)]
        
        # Combine into two landscape pages (Front and Back)
        for left_page, right_page in [(p_front_left, p_front_right), (p_back_left, p_back_right)]:
            new_page = PageObject.create_blank_page(width=landscape_width, height=landscape_height)
            
            # Place left page
            if left_page:
                new_page.merge_page(left_page)
                
            # Place right page (translated horizontally to the right half)
            if right_page:
                op = Transformation().translate(tx=page_width, ty=0)
                right_page_copy = PageObject.create_blank_page(width=landscape_width, height=landscape_height)
                right_page_copy.merge_page(right_page)
                right_page_copy.add_transformation(op)
                new_page.merge_page(right_page_copy)
                
            writer.add_page(new_page)
            
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_pdf_path), exist_ok=True)
    
    with open(output_pdf_path, "wb") as f:
        writer.write(f)
    print(f"Created booklet: {output_pdf_path}")

def main():
    # Find all PDFs in bulletins directory
    pdf_files = glob.glob("bulletins/*.pdf")
    
    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        base_name = os.path.splitext(filename)[0]
        
        # Output destination: booklet/ folder
        output_path = os.path.join("booklet", f"{base_name}-booklet.pdf")
        
        print(f"Processing: {pdf_path} -> {output_path}")
        create_booklet(pdf_path, output_path)

if __name__ == "__main__":
    main()
