"""
QRIS Microservice - CRC16 Calculation Service
Port: 33416
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

def crc16ccitt(data: str) -> int:
    """Calculate CRC-16-CCITT checksum"""
    crc = 0xFFFF
    for char in data:
        crc ^= ord(char) << 8
        for _ in range(8):
            if (crc & 0x8000) != 0:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
    return crc & 0xFFFF

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'qris-calculator'})

@app.route('/generate-qris', methods=['POST'])
def generate_qris():
    """
    Generate dynamic QRIS string with CRC16 calculation
    
    Request body:
    {
        "base_string": "00020101021126570011...",
        "amount": 50000
    }
    
    Response:
    {
        "qris_string": "complete QRIS string with CRC",
        "amount": 50000,
        "crc": "ABCD"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        base_string = data.get('base_string')
        amount = data.get('amount')
        
        if not base_string:
            return jsonify({'error': 'base_string is required'}), 400
        
        if not amount or not isinstance(amount, (int, float)) or amount < 1:
            return jsonify({'error': 'Invalid amount'}), 400
        
        # Convert amount to integer
        amount = int(amount)
        amount_str = str(amount)
        amount_length = str(len(amount_str)).zfill(2)
        
        # Build amount tag (Tag 54)
        amount_tag = f"54{amount_length}{amount_str}"
        
        # Combine base string with amount tag and CRC placeholder
        string_for_crc = f"{base_string}{amount_tag}6304"
        
        # Calculate CRC16
        calculated_crc = crc16ccitt(string_for_crc)
        crc_hex = format(calculated_crc, '04X')
        
        # Final QRIS string
        final_qris_string = f"{string_for_crc}{crc_hex}"
        
        return jsonify({
            'qris_string': final_qris_string,
            'amount': amount,
            'crc': crc_hex,
            'success': True
        })
    
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/validate-qris', methods=['POST'])
def validate_qris():
    """Validate QRIS string CRC"""
    try:
        data = request.get_json()
        qris_string = data.get('qris_string')
        
        if not qris_string or len(qris_string) < 4:
            return jsonify({'error': 'Invalid QRIS string'}), 400
        
        # Extract CRC from last 4 characters
        provided_crc = qris_string[-4:]
        qris_without_crc = qris_string[:-4]
        
        # Calculate CRC
        calculated_crc = crc16ccitt(qris_without_crc)
        calculated_crc_hex = format(calculated_crc, '04X')
        
        is_valid = provided_crc.upper() == calculated_crc_hex
        
        return jsonify({
            'valid': is_valid,
            'provided_crc': provided_crc,
            'calculated_crc': calculated_crc_hex
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('QRIS_SERVICE_PORT', 33416))
    print(f"🔧 QRIS Calculation Service running on port {port}")
    print(f"📡 Endpoints:")
    print(f"   - POST /generate-qris")
    print(f"   - POST /validate-qris")
    print(f"   - GET  /health")
    app.run(host='0.0.0.0', port=port, debug=False)
